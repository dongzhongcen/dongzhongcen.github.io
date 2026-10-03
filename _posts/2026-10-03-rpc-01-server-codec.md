---
title: "RPC 框架（一）：服务端与消息编码"
date: 2026-10-03 11:30:00 +0800
categories: [Golang, RPC框架]
tags: [golang, rpc, gob, 编解码, 服务端]
---

RPC（Remote Procedure Call，远程过程调用）让我们<span style="color:#e03131">像调用本地函数一样调用另一台机器上的函数</span>。这个系列用 Go 从零写一个 RPC 框架，项目名叫 `dzcsrpc`。第一篇先做两件事：<span style="color:#e03131">用 encoding/gob 实现消息的编码和解码</span>，再写一个只接收请求、暂时不真正处理的简易服务端，代码大约 200 行。

## 1.1 一次 RPC 调用要传什么

一个典型的 RPC 调用长这样：

```go
err = client.Call("Arith.Multiply", args, &reply)
```

客户端要告诉服务端三件事：服务名 `Arith`、方法名 `Multiply`、参数 `args`；服务端要回两样东西：错误 `error` 和返回值 `reply`。

我们把<span style="color:#e03131">参数和返回值统称为 Body</span>，其余信息统一放进 Header，请求和响应共用同一个 Header 结构。

![一次 RPC 调用拆成 Header 和 Body](/assets/img/rpc/rpc-header-body.svg)

**图解：** 左边是请求，右边是响应。Header 里的 `ServiceMethod` 说明调用哪个服务的哪个方法，`Seq` 是请求序号；服务端回复时原样带回同一个 `Seq`，<span style="color:#e03131">客户端靠 Seq 把响应和请求对上号</span>。`Error` 在请求里是空的，只有服务端出错时才填。参数 `args` 和返回值 `reply` 分别放在各自的 Body 里。

## 1.2 项目结构

先在根目录初始化模块，方便子包之间互相引用：

```bash
mkdir dzcsrpc && cd dzcsrpc
go mod init dzcsrpc
```

最终目录如下：

```text
dzcsrpc/
├── go.mod
├── server.go          # 协议协商 + 服务端
├── codec/
│   ├── codec.go       # Header、Codec 接口、构造函数表
│   └── gob.go         # 用 gob 实现的 Codec
└── main/
    └── main.go        # 一个简易客户端，用来测试
```

和编解码有关的代码都放在 `codec` 子包里。

## 1.3 消息编解码 Codec

### 1.3.1 Header

```go
// Header 是请求和响应共用的消息头
type Header struct {
	ServiceMethod string // 服务名.方法名，比如 "Arith.Multiply"
	Seq           uint64 // 请求序号，由客户端生成，用来区分不同请求
	Error         string // 错误信息，客户端发请求时为空，服务端出错时填写
}
```

- `ServiceMethod`：服务名和方法名，通常对应 Go 里的结构体和它的方法。
- `Seq`：请求序号，可以理解成请求的 ID，用来区分不同的请求。
- `Error`：错误信息。客户端发请求时为空，服务端出错就把错误写进来。

### 1.3.2 Codec 接口

把“对消息进行编解码”抽象成一个接口，<span style="color:#e03131">以后想换 JSON、Protobuf 等编码方式，只要再实现一遍这个接口</span>：

```go
// Codec 是消息编解码器的抽象
type Codec interface {
	io.Closer
	ReadHeader(*Header) error
	ReadBody(any) error
	Write(*Header, any) error
}
```

`io.Closer` 提供 `Close()`，用来关闭底层连接；`ReadHeader` 和 `ReadBody` 负责读，`Write` 一次把 Header 和 Body 都写出去。`any` 就是 `interface{}` 的别名，表示任意类型。

### 1.3.3 构造函数表

客户端和服务端要能<span style="color:#e03131">根据编码方式的名字，找到对应的 Codec 构造函数</span>：

```go
// NewCodecFunc 是 Codec 的构造函数
type NewCodecFunc func(io.ReadWriteCloser) Codec

// Type 表示编码方式
type Type string

const (
	GobType  Type = "application/gob"
	JsonType Type = "application/json" // 暂未实现
)

// NewCodecFuncMap 根据编码方式找到对应的构造函数
var NewCodecFuncMap map[Type]NewCodecFunc

func init() {
	NewCodecFuncMap = make(map[Type]NewCodecFunc)
	NewCodecFuncMap[GobType] = NewGobCodec
}
```

这有点像工厂模式，不同的是 map 里存的是<span style="color:#e03131">构造函数</span>而不是实例：每来一个新连接，就用这个函数基于该连接创建一个新的 Codec。这里定义了 Gob 和 Json 两种类型，目前只实现了 Gob；两者写法几乎一样，把 `gob` 换成 `json` 基本就行。

### 1.3.4 GobCodec

```go
// GobCodec 用 encoding/gob 实现 Codec 接口
type GobCodec struct {
	conn io.ReadWriteCloser // 底层连接，比如 TCP 连接
	buf  *bufio.Writer      // 带缓冲的 Writer，减少系统调用
	dec  *gob.Decoder       // 从 conn 读取并解码
	enc  *gob.Encoder       // 编码后写入 buf
}

// 编译期检查：确保 *GobCodec 实现了 Codec 接口
var _ Codec = (*GobCodec)(nil)

func NewGobCodec(conn io.ReadWriteCloser) Codec {
	buf := bufio.NewWriter(conn)
	return &GobCodec{
		conn: conn,
		buf:  buf,
		dec:  gob.NewDecoder(conn),
		enc:  gob.NewEncoder(buf),
	}
}
```

`GobCodec` 由四部分组成：

- `conn`：构造时传进来的连接，通常是建立 TCP 或 Unix socket 时得到的。
- `dec`：gob 的 Decoder，直接从 `conn` 读。
- `enc`：gob 的 Encoder，<span style="color:#e03131">写到带缓冲的 buf 里而不是直接写 conn</span>，攒够了一次性发出去，减少系统调用，性能更好。
- `buf`：就是上面那个缓冲 Writer。

`var _ Codec = (*GobCodec)(nil)` 是个常用技巧：把一个 `*GobCodec` 类型的 nil 赋给 `Codec` 接口变量，<span style="color:#e03131">如果 GobCodec 没实现完接口里的方法，编译就会报错</span>，不用等到运行时才发现。

接着实现四个方法：

```go
func (c *GobCodec) ReadHeader(h *Header) error {
	return c.dec.Decode(h)
}

func (c *GobCodec) ReadBody(body any) error {
	return c.dec.Decode(body)
}

func (c *GobCodec) Write(h *Header, body any) (err error) {
	defer func() {
		_ = c.buf.Flush() // 把缓冲区里的数据真正发出去
		if err != nil {
			_ = c.Close()
		}
	}()
	if err = c.enc.Encode(h); err != nil {
		log.Println("rpc codec: gob error encoding header:", err)
		return err
	}
	if err = c.enc.Encode(body); err != nil {
		log.Println("rpc codec: gob error encoding body:", err)
		return err
	}
	return nil
}

func (c *GobCodec) Close() error {
	return c.conn.Close()
}
```

`Write` 用 `defer` 做收尾：<span style="color:#e03131">不管成功还是失败都要 Flush</span>，把缓冲区里的数据真正发出去；如果中途出错，就顺手关掉连接。注意这里用的是命名返回值 `err`，`defer` 里才能看到它的值。

## 1.4 通信协议：Option

客户端和服务端通信前要先“商量好”一些事情。比如 HTTP 报文分为 header 和 body，body 的格式和长度由 header 里的 `Content-Type`、`Content-Length` 说明。RPC 协议的这部分需要我们自己设计。为了性能，很多协议会在报文开头留出固定的几个字节来协商，比如第 1 个字节表示序列化方式、第 2 个字节表示压缩方式、第 3~6 字节表示 header 长度等。

我们现在<span style="color:#e03131">唯一需要协商的就是编解码方式</span>，把它放进结构体 `Option`：

```go
// MagicNumber 用来标记这是一个 dzcsrpc 请求
const MagicNumber = 0x3bef5c

// Option 放在连接的最开头，用来协商编码方式
type Option struct {
	MagicNumber int        // 魔数，标记这是 dzcsrpc 的请求
	CodecType   codec.Type // 客户端选择的 Header 和 Body 的编码方式
}

var DefaultOption = &Option{
	MagicNumber: MagicNumber,
	CodecType:   codec.GobType,
}
```

为了实现简单，规定 <span style="color:#e03131">Option 固定用 JSON 编码</span>，后面的 Header 和 Body 用什么编码，由 Option 里的 `CodecType` 决定。服务端先用 JSON 解出 Option，再按 `CodecType` 解后面的内容。

![一个连接里的报文格式](/assets/img/rpc/rpc-message.svg)

**图解：** 一个连接的开头是 <span style="color:#e03131">只发一次</span>的 Option（黄色，JSON 编码），后面是一组又一组的 Header + Body（蓝色，编码方式由 `CodecType` 决定，目前是 gob），一个连接里可以连续发很多个请求。下方是 Option 的实际 JSON 内容：`MagicNumber` 是 `0x3bef5c`（十进制 3927900），服务端用它判断对方是不是在说同一种协议。

## 1.5 服务端的实现

### 1.5.1 Server 与 Accept

```go
// Server 表示一个 RPC 服务端
type Server struct{}

func NewServer() *Server {
	return &Server{}
}

// DefaultServer 是默认的 Server 实例，方便直接使用
var DefaultServer = NewServer()

// Accept 循环接收连接，每个连接交给一个新的 goroutine 处理
func (server *Server) Accept(lis net.Listener) {
	for {
		conn, err := lis.Accept()
		if err != nil {
			log.Println("rpc server: accept error:", err)
			return
		}
		go server.ServeConn(conn)
	}
}

// Accept 使用 DefaultServer 接收连接
func Accept(lis net.Listener) { DefaultServer.Accept(lis) }
```

- `Server` 目前没有任何字段，后面会逐步加东西。
- `Accept` 接收一个 `net.Listener`，<span style="color:#e03131">for 循环等待连接，每来一个连接就开一个 goroutine 交给 ServeConn</span>。
- `DefaultServer` 是默认实例，再配一个包级的 `Accept` 函数，用起来更方便。

启动服务只要传入一个 listener，TCP 和 Unix socket 都可以：

```go
lis, _ := net.Listen("tcp", ":9999")
dzcsrpc.Accept(lis)
```

### 1.5.2 ServeConn：协商编码方式

```go
// ServeConn 处理一个连接，直到客户端断开
func (server *Server) ServeConn(conn io.ReadWriteCloser) {
	defer func() { _ = conn.Close() }()
	var opt Option
	if err := json.NewDecoder(conn).Decode(&opt); err != nil {
		log.Println("rpc server: options error:", err)
		return
	}
	if opt.MagicNumber != MagicNumber {
		log.Printf("rpc server: invalid magic number %x", opt.MagicNumber)
		return
	}
	f := codec.NewCodecFuncMap[opt.CodecType]
	if f == nil {
		log.Printf("rpc server: invalid codec type %s", opt.CodecType)
		return
	}
	server.serveCodec(f(conn))
}
```

步骤和 1.4 的协议一一对应：

1. 用 `json.NewDecoder` 解出 Option；
2. 检查 `MagicNumber`，不对就说明不是我们的协议，直接关闭连接；
3. 按 `CodecType` 从 `NewCodecFuncMap` 里取构造函数，找不到就说明不支持这种编码；
4. 用构造函数基于这个连接创建 Codec，交给 `serveCodec`。

### 1.5.3 serveCodec：循环处理请求

```go
// invalidRequest 是出错时响应体的占位符
var invalidRequest = struct{}{}

func (server *Server) serveCodec(cc codec.Codec) {
	sending := new(sync.Mutex) // 保证一个响应完整发送后再发下一个
	wg := new(sync.WaitGroup)  // 等待所有请求处理完
	for {
		req, err := server.readRequest(cc)
		if err != nil {
			if req == nil {
				break // header 都读不出来，没法恢复，关闭连接
			}
			req.h.Error = err.Error()
			server.sendResponse(cc, req.h, invalidRequest, sending)
			continue
		}
		wg.Add(1)
		go server.handleRequest(cc, req, sending, wg)
	}
	wg.Wait()
	_ = cc.Close()
}
```

`serveCodec` 主要分三个阶段：<span style="color:#e03131">读取请求 readRequest → 处理请求 handleRequest → 回复请求 sendResponse</span>。

因为一个连接里可以有多组 Header + Body，所以用 for 循环一直读，直到出错（比如连接被关闭、报文有问题）。这里有三个要点：

- `handleRequest` 用 goroutine <span style="color:#e03131">并发</span>处理请求。
- 处理是并发的，但<span style="color:#e03131">回复必须一个一个发</span>，否则多个响应的字节会交织在一起，客户端没法解析，所以用互斥锁 `sending` 保证。
- 尽力而为：只有 Header 都解析失败时才退出循环；退出前用 `wg.Wait()` 等所有正在处理的请求做完，再关闭 Codec。

![服务端处理流程](/assets/img/rpc/rpc-server-flow.svg)

**图解：** 最上面的 `Accept` 循环接收连接，每个连接各开一个 `ServeConn` goroutine。虚线框里是一个连接的处理过程：先用 JSON 解码 Option 并检查魔数和编码类型，不对就关闭连接；通过后创建 Codec 进入 `serveCodec` 循环，不断“读请求 → 开 goroutine 处理 → 加锁回复”。右边红框是关键：<span style="color:#e03131">请求并发处理，回复加锁逐个发送</span>，WaitGroup 负责等所有请求处理完。

### 1.5.4 读取、处理、回复

```go
// request 保存一次调用的全部信息
type request struct {
	h            *codec.Header // 请求头
	argv, replyv reflect.Value // 请求参数和返回值
}

func (server *Server) readRequestHeader(cc codec.Codec) (*codec.Header, error) {
	var h codec.Header
	if err := cc.ReadHeader(&h); err != nil {
		if err != io.EOF && err != io.ErrUnexpectedEOF {
			log.Println("rpc server: read header error:", err)
		}
		return nil, err
	}
	return &h, nil
}

func (server *Server) readRequest(cc codec.Codec) (*request, error) {
	h, err := server.readRequestHeader(cc)
	if err != nil {
		return nil, err
	}
	req := &request{h: h}
	// TODO：现在还不知道参数的真实类型，先假设是 string
	req.argv = reflect.New(reflect.TypeOf(""))
	if err = cc.ReadBody(req.argv.Interface()); err != nil {
		log.Println("rpc server: read argv err:", err)
	}
	return req, nil
}

func (server *Server) sendResponse(cc codec.Codec, h *codec.Header, body any, sending *sync.Mutex) {
	sending.Lock()
	defer sending.Unlock()
	if err := cc.Write(h, body); err != nil {
		log.Println("rpc server: write response error:", err)
	}
}

func (server *Server) handleRequest(cc codec.Codec, req *request, sending *sync.Mutex, wg *sync.WaitGroup) {
	// TODO：之后要调用真正注册的方法，现在只打印参数并回一句话
	defer wg.Done()
	log.Println(req.h, req.argv.Elem())
	req.replyv = reflect.ValueOf(fmt.Sprintf("dzcsrpc resp %d", req.h.Seq))
	server.sendResponse(cc, req.h, req.replyv.Interface(), sending)
}
```

- `request` 保存一次调用的全部信息：Header、参数 `argv`、返回值 `replyv`。
- `readRequestHeader` 读 Header；读到 `io.EOF` 说明客户端正常断开，不用打日志。
- `readRequest` 先读 Header 再读 Body。<span style="color:#e03131">现在还不知道参数的真实类型，先假设是 string</span>，用 `reflect.New` 创建一个 `*string` 来接收。
- `handleRequest` 暂时不调用真正的方法，只打印 Header 和参数，然后回一句 `dzcsrpc resp <序号>`。
- `sendResponse` 加锁后调用 `cc.Write`，保证响应完整发送。

真正按类型解析参数、调用注册的方法，留到后面的章节实现。

## 1.6 写个简易客户端测试一下

`main` 函数里同时启动服务端，再手写一个最简单的客户端：

```go
package main

import (
	"dzcsrpc"
	"dzcsrpc/codec"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"time"
)

func startServer(addr chan string) {
	// 端口写 0，让系统随便挑一个空闲端口
	l, err := net.Listen("tcp", ":0")
	if err != nil {
		log.Fatal("network error:", err)
	}
	log.Println("start rpc server on", l.Addr())
	addr <- l.Addr().String()
	dzcsrpc.Accept(l)
}

func main() {
	log.SetFlags(0)
	addr := make(chan string)
	go startServer(addr)

	// 下面这段相当于一个最简单的客户端
	conn, _ := net.Dial("tcp", <-addr)
	defer func() { _ = conn.Close() }()

	time.Sleep(time.Second)
	// 1. 先用 JSON 发送 Option
	_ = json.NewEncoder(conn).Encode(dzcsrpc.DefaultOption)
	cc := codec.NewGobCodec(conn)
	// 2. 再用 gob 发送请求、接收响应
	for i := 0; i < 5; i++ {
		h := &codec.Header{
			ServiceMethod: "Foo.Sum",
			Seq:           uint64(i),
		}
		_ = cc.Write(h, fmt.Sprintf("dzcsrpc req %d", h.Seq))
		_ = cc.ReadHeader(h)
		var reply string
		_ = cc.ReadBody(&reply)
		log.Println("reply:", reply)
	}
}
```

- `startServer` 监听 `:0`，让系统随机分配一个空闲端口，再通过 channel `addr` 把地址传给客户端，<span style="color:#e03131">确保服务端已经开始监听，客户端才去连接</span>。
- 客户端先用 JSON 发送 `DefaultOption` 完成协议协商，然后用 gob 连发 5 个请求：Header 里 `ServiceMethod` 是 `Foo.Sum`，Body 是字符串 `dzcsrpc req <序号>`。
- 每发一个请求就读一次响应，打印出 `reply`。
- `log.SetFlags(0)` 只是去掉日志前面的时间，让输出更干净。

在项目根目录运行：

```bash
go run ./main
```

运行结果（端口每次不同）：

```text
start rpc server on [::]:33871
&{Foo.Sum 0 } dzcsrpc req 0
reply: dzcsrpc resp 0
&{Foo.Sum 1 } dzcsrpc req 1
reply: dzcsrpc resp 1
&{Foo.Sum 2 } dzcsrpc req 2
reply: dzcsrpc resp 2
&{Foo.Sum 3 } dzcsrpc req 3
reply: dzcsrpc resp 3
&{Foo.Sum 4 } dzcsrpc req 4
reply: dzcsrpc resp 4
```

`&{Foo.Sum 0 }` 是服务端打印的 Header（`Error` 为空，所以 0 后面是个空格），后面跟着收到的参数；`reply:` 那行是客户端收到的响应。

## 1.7 一个小坑：为什么要 sleep 一秒

客户端代码里有一行 `time.Sleep(time.Second)`，看起来很多余。我试着把它删掉再运行，结果<span style="color:#e03131">程序卡住不动，服务端一个请求都没收到</span>。原因在 `json.Decoder`：

![json.Decoder 多读导致 gob 数据丢失](/assets/img/rpc/rpc-json-buffer.svg)

**图解：** 客户端没有停顿地连续写入 Option、Header0、Body0。服务端的 `json.Decoder` 为了效率，会<span style="color:#e03131">从连接里一次多读一块数据</span>放进自己的缓冲区（红色虚线框），可能把后面的 gob 字节也一起读走。它只解析出 Option，多读的部分留在它自己的缓冲区里；随后 gob 的 Decoder 直接从 conn 读，前面那段已经被“吃掉”了，Header 解不出来，双方就互相等着卡住了。

`sleep 1` 秒让 Option 先单独到达服务端，暂时绕开这个问题。这只是权宜之计，后面的章节会在协议层面把它彻底解决。

## 完整代码

### go.mod

```text
module dzcsrpc

go 1.22
```

### codec/codec.go

```go
package codec

import "io"

// Header 是请求和响应共用的消息头
type Header struct {
	ServiceMethod string // 服务名.方法名，比如 "Arith.Multiply"
	Seq           uint64 // 请求序号，由客户端生成，用来区分不同请求
	Error         string // 错误信息，客户端发请求时为空，服务端出错时填写
}

// Codec 是消息编解码器的抽象
type Codec interface {
	io.Closer
	ReadHeader(*Header) error
	ReadBody(any) error
	Write(*Header, any) error
}

// NewCodecFunc 是 Codec 的构造函数
type NewCodecFunc func(io.ReadWriteCloser) Codec

// Type 表示编码方式
type Type string

const (
	GobType  Type = "application/gob"
	JsonType Type = "application/json" // 暂未实现
)

// NewCodecFuncMap 根据编码方式找到对应的构造函数
var NewCodecFuncMap map[Type]NewCodecFunc

func init() {
	NewCodecFuncMap = make(map[Type]NewCodecFunc)
	NewCodecFuncMap[GobType] = NewGobCodec
}
```

### codec/gob.go

```go
package codec

import (
	"bufio"
	"encoding/gob"
	"io"
	"log"
)

// GobCodec 用 encoding/gob 实现 Codec 接口
type GobCodec struct {
	conn io.ReadWriteCloser // 底层连接，比如 TCP 连接
	buf  *bufio.Writer      // 带缓冲的 Writer，减少系统调用
	dec  *gob.Decoder       // 从 conn 读取并解码
	enc  *gob.Encoder       // 编码后写入 buf
}

// 编译期检查：确保 *GobCodec 实现了 Codec 接口
var _ Codec = (*GobCodec)(nil)

func NewGobCodec(conn io.ReadWriteCloser) Codec {
	buf := bufio.NewWriter(conn)
	return &GobCodec{
		conn: conn,
		buf:  buf,
		dec:  gob.NewDecoder(conn),
		enc:  gob.NewEncoder(buf),
	}
}

func (c *GobCodec) ReadHeader(h *Header) error {
	return c.dec.Decode(h)
}

func (c *GobCodec) ReadBody(body any) error {
	return c.dec.Decode(body)
}

func (c *GobCodec) Write(h *Header, body any) (err error) {
	defer func() {
		_ = c.buf.Flush() // 把缓冲区里的数据真正发出去
		if err != nil {
			_ = c.Close()
		}
	}()
	if err = c.enc.Encode(h); err != nil {
		log.Println("rpc codec: gob error encoding header:", err)
		return err
	}
	if err = c.enc.Encode(body); err != nil {
		log.Println("rpc codec: gob error encoding body:", err)
		return err
	}
	return nil
}

func (c *GobCodec) Close() error {
	return c.conn.Close()
}
```

### server.go

```go
package dzcsrpc

import (
	"dzcsrpc/codec"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"reflect"
	"sync"
)

// MagicNumber 用来标记这是一个 dzcsrpc 请求
const MagicNumber = 0x3bef5c

// Option 放在连接的最开头，用来协商编码方式
type Option struct {
	MagicNumber int        // 魔数，标记这是 dzcsrpc 的请求
	CodecType   codec.Type // 客户端选择的 Header 和 Body 的编码方式
}

var DefaultOption = &Option{
	MagicNumber: MagicNumber,
	CodecType:   codec.GobType,
}

// Server 表示一个 RPC 服务端
type Server struct{}

func NewServer() *Server {
	return &Server{}
}

// DefaultServer 是默认的 Server 实例，方便直接使用
var DefaultServer = NewServer()

// Accept 循环接收连接，每个连接交给一个新的 goroutine 处理
func (server *Server) Accept(lis net.Listener) {
	for {
		conn, err := lis.Accept()
		if err != nil {
			log.Println("rpc server: accept error:", err)
			return
		}
		go server.ServeConn(conn)
	}
}

// Accept 使用 DefaultServer 接收连接
func Accept(lis net.Listener) { DefaultServer.Accept(lis) }

// ServeConn 处理一个连接，直到客户端断开
func (server *Server) ServeConn(conn io.ReadWriteCloser) {
	defer func() { _ = conn.Close() }()
	var opt Option
	if err := json.NewDecoder(conn).Decode(&opt); err != nil {
		log.Println("rpc server: options error:", err)
		return
	}
	if opt.MagicNumber != MagicNumber {
		log.Printf("rpc server: invalid magic number %x", opt.MagicNumber)
		return
	}
	f := codec.NewCodecFuncMap[opt.CodecType]
	if f == nil {
		log.Printf("rpc server: invalid codec type %s", opt.CodecType)
		return
	}
	server.serveCodec(f(conn))
}

// invalidRequest 是出错时响应体的占位符
var invalidRequest = struct{}{}

func (server *Server) serveCodec(cc codec.Codec) {
	sending := new(sync.Mutex) // 保证一个响应完整发送后再发下一个
	wg := new(sync.WaitGroup)  // 等待所有请求处理完
	for {
		req, err := server.readRequest(cc)
		if err != nil {
			if req == nil {
				break // header 都读不出来，没法恢复，关闭连接
			}
			req.h.Error = err.Error()
			server.sendResponse(cc, req.h, invalidRequest, sending)
			continue
		}
		wg.Add(1)
		go server.handleRequest(cc, req, sending, wg)
	}
	wg.Wait()
	_ = cc.Close()
}

// request 保存一次调用的全部信息
type request struct {
	h            *codec.Header // 请求头
	argv, replyv reflect.Value // 请求参数和返回值
}

func (server *Server) readRequestHeader(cc codec.Codec) (*codec.Header, error) {
	var h codec.Header
	if err := cc.ReadHeader(&h); err != nil {
		if err != io.EOF && err != io.ErrUnexpectedEOF {
			log.Println("rpc server: read header error:", err)
		}
		return nil, err
	}
	return &h, nil
}

func (server *Server) readRequest(cc codec.Codec) (*request, error) {
	h, err := server.readRequestHeader(cc)
	if err != nil {
		return nil, err
	}
	req := &request{h: h}
	// TODO：现在还不知道参数的真实类型，先假设是 string
	req.argv = reflect.New(reflect.TypeOf(""))
	if err = cc.ReadBody(req.argv.Interface()); err != nil {
		log.Println("rpc server: read argv err:", err)
	}
	return req, nil
}

func (server *Server) sendResponse(cc codec.Codec, h *codec.Header, body any, sending *sync.Mutex) {
	sending.Lock()
	defer sending.Unlock()
	if err := cc.Write(h, body); err != nil {
		log.Println("rpc server: write response error:", err)
	}
}

func (server *Server) handleRequest(cc codec.Codec, req *request, sending *sync.Mutex, wg *sync.WaitGroup) {
	// TODO：之后要调用真正注册的方法，现在只打印参数并回一句话
	defer wg.Done()
	log.Println(req.h, req.argv.Elem())
	req.replyv = reflect.ValueOf(fmt.Sprintf("dzcsrpc resp %d", req.h.Seq))
	server.sendResponse(cc, req.h, req.replyv.Interface(), sending)
}
```

### main/main.go

```go
package main

import (
	"dzcsrpc"
	"dzcsrpc/codec"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"time"
)

func startServer(addr chan string) {
	// 端口写 0，让系统随便挑一个空闲端口
	l, err := net.Listen("tcp", ":0")
	if err != nil {
		log.Fatal("network error:", err)
	}
	log.Println("start rpc server on", l.Addr())
	addr <- l.Addr().String()
	dzcsrpc.Accept(l)
}

func main() {
	log.SetFlags(0)
	addr := make(chan string)
	go startServer(addr)

	// 下面这段相当于一个最简单的客户端
	conn, _ := net.Dial("tcp", <-addr)
	defer func() { _ = conn.Close() }()

	time.Sleep(time.Second)
	// 1. 先用 JSON 发送 Option
	_ = json.NewEncoder(conn).Encode(dzcsrpc.DefaultOption)
	cc := codec.NewGobCodec(conn)
	// 2. 再用 gob 发送请求、接收响应
	for i := 0; i < 5; i++ {
		h := &codec.Header{
			ServiceMethod: "Foo.Sum",
			Seq:           uint64(i),
		}
		_ = cc.Write(h, fmt.Sprintf("dzcsrpc req %d", h.Seq))
		_ = cc.ReadHeader(h)
		var reply string
		_ = cc.ReadBody(&reply)
		log.Println("reply:", reply)
	}
}
```
