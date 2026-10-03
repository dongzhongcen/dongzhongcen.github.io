---
title: "Go 语言（一）：程序结构"
date: 2026-10-03 10:00:00 +0800
categories: [Golang]
tags: [golang, 变量, 指针, 类型, 包, 作用域]
---

一个 Go 程序由很多小构件搭起来：<span style="color:#e03131">变量保存值 → 表达式组合值 → 语句控制执行流程 → 函数封装语句 → 源文件和包组织函数</span>。这一章讲的就是这些构件的基本规则。

## 1.1 命名

Go 里函数、变量、常量、类型、语句标号、包的名字都遵守同一条规则：<span style="color:#e03131">以字母（Unicode 字母）或下划线开头，后面跟任意个字母、数字、下划线</span>。区分大小写，`userName` 和 `Username` 是两个不同的名字。

**25 个关键字**，不能拿来当名字：

```text
break      default       func     interface   select
case       defer         go       map         struct
chan       else          goto     package     switch
const      fallthrough   if       range       type
continue   for           import   return      var
```

**预定义名字**（不是关键字，可以被重新定义，但最好别这么做）：

| 分类 | 名字 |
| --- | --- |
| 内建常量 | `true` `false` `iota` `nil` |
| 内建类型 | `int` `int8~64` `uint` `uint8~64` `uintptr` `float32` `float64` `complex64` `complex128` `bool` `byte` `rune` `string` `error` |
| 内建函数 | `make` `len` `cap` `new` `append` `copy` `close` `delete` `complex` `real` `imag` `panic` `recover` |

**可见性**：这是 Go 和 Java 差别很大的地方，Go 没有 `public` / `private` 关键字。

- 在函数内部声明的名字，只在函数内部有效
- 在函数外部（包级）声明的名字，整个包的所有文件都能用
- <span style="color:#e03131">包级名字如果首字母大写，就是导出的，其他包也能访问</span>，比如 `fmt.Println`；首字母小写就只有包内能用
- 包名本身一般全小写
- 中文汉字算“小写”，所以汉字开头的名字不能导出

**命名风格**：

- 用驼峰，不用下划线：写 `parseRequestLine`，不写 `parse_request_line`
- 缩略词保持统一大小写：写 `escapeHTML`、`HTMLEscape`，不写 `escapeHtml`
- <span style="color:#e03131">作用域越小，名字越短</span>：循环变量就用 `i`，不用 `theLoopIndex`；作用域大、活得久的名字才值得起长名字

## 1.2 声明

Go 有四种声明：<span style="color:#e03131">`var`（变量）、`const`（常量）、`type`（类型）、`func`（函数）</span>。

一个 `.go` 源文件的结构固定是：`package` 声明 → `import` 导入 → 包级的类型、变量、常量、函数声明。<span style="color:#e03131">包级声明的先后顺序无所谓</span>，函数写在 `main` 后面也能调用；但函数内部的名字必须先声明再使用。

```go
// 打印一件商品打折后的价格
package main

import "fmt"

const discount = 0.8 // 包级常量：整个包都能用

func main() {
	var price = 299.0             // 局部变量
	var final = finalPrice(price) // 调用下面声明的函数
	fmt.Printf("原价 %.1f 元，打 8 折后 %.1f 元\n", price, final)
}

// 包级函数：写在 main 后面也没关系
func finalPrice(p float64) float64 {
	return p * discount
}
```

```text
原价 299.0 元，打 8 折后 239.2 元
```

`discount` 和 `finalPrice` 是包级的，`price` 和 `final` 是 `main` 里的局部变量，出了 `main` 就访问不到。

## 1.3 变量

### 1.3.1 var 声明与零值

```go
var 变量名 类型 = 表达式
```

“类型”和“= 表达式”可以省掉其中一个：

- 省掉类型：根据表达式自动推导类型
- 省掉表达式：用该类型的<span style="color:#e03131">零值</span>初始化

| 类型 | 零值 |
| --- | --- |
| 数值类型 | `0` |
| 布尔 | `false` |
| 字符串 | `""` |
| 接口、指针、slice、map、chan、函数 | `nil` |
| 数组、结构体 | 每个元素或字段都是各自类型的零值 |

<span style="color:#e03131">Go 里不存在“未初始化的变量”</span>，这一点和 Java 局部变量不赋值就报错不一样。比如 `var s string` 之后直接打印，得到的是空字符串，不会出错。

一次声明多个：

```go
var i, j, k int                   // int, int, int
var ok, rate, city = true, 0.5, "上海" // bool, float64, string
var n, err = strconv.Atoi("42")   // 用函数的多个返回值初始化
```

包级变量在 `main` 执行之前就初始化好了；局部变量在执行到声明语句时才初始化。

### 1.3.2 简短变量声明 :=

在函数内部，最常用的写法是 `名字 := 表达式`，类型自动推导：

```go
count := 0
name := "Marianna"
var total float64 = 100 // 需要明确指定类型时，还是用 var
var tags []string       // 只想要零值、后面再赋值时，也用 var
```

要分清两个符号：<span style="color:#e03131">`:=` 是声明，`=` 是赋值</span>。

`:=` 有一个容易忽略的规则：<span style="color:#e03131">左边至少要有一个新变量</span>。已经在同一个作用域声明过的变量，在 `:=` 里只是被赋值。

```go
a, err := strconv.Atoi("12") // 声明 a 和 err
b, err := strconv.Atoi("34") // 只声明了 b，err 是赋值
```

如果左边全是旧变量，编译直接报错：

```go
n, err := strconv.Atoi("12")
n, err := strconv.Atoi("34") // no new variables on left side of :=
```

改成 `n, err = ...` 就好了。另外，<span style="color:#e03131">如果旧变量是在外层作用域声明的，`:=` 会在当前作用域新建一个同名变量</span>，而不是给外层的赋值，这个坑在 1.7 节会细讲。

### 1.3.3 指针

<span style="color:#e03131">指针的值是另一个变量的地址</span>。

- `&x`：取变量 x 的地址，如果 x 是 `int`，得到的类型就是 `*int`
- `*p`：顺着指针 p 找到它指向的变量，可以读，也可以放在赋值号左边去改

```go
package main

import "fmt"

func heal(hp *int, n int) {
	*hp += n // 改的是 hp 指向的那个变量，不是指针本身
}

func newPlayer() *int {
	hp := 100
	return &hp // 返回局部变量的地址是安全的
}

func main() {
	hp := 60
	p := &hp
	fmt.Println(*p) // 60
	*p = 80
	fmt.Println(hp) // 80
	heal(&hp, 15)
	fmt.Println(hp) // 95

	var a, b int
	fmt.Println(&a == &a, &a == &b, &a == nil) // true false false
	fmt.Println(newPlayer() == newPlayer())    // false
}
```

![指针示意图](/assets/img/go/go-pointer.svg)

**图解：** 左边蓝色格子是变量 `hp`，里面存的是 60（后来被改成 80），它在内存里的地址是 `0xc000012080`。右边红色格子是变量 `p`，它自己也有地址，但它存的值正好是 `hp` 的地址，所以说“p 指向 hp”。

- `&hp` 得到的就是 `0xc000012080` 这个地址
- `*p` 是顺着箭头走到 `hp`，所以 <span style="color:#e03131">`*p = 80` 和 `hp = 80` 完全等价</span>
- `p = nil` 改的是 `p` 自己那个格子，箭头断开了，`hp` 不受影响

几个要点：

- <span style="color:#e03131">指针的零值是 `nil`</span>；两个指针相等，当且仅当它们指向同一个变量，或者都是 `nil`
- <span style="color:#e03131">在 Go 里返回局部变量的地址是安全的</span>（在 C 里这是严重 bug）。`newPlayer` 每次调用都新建一个 `hp`，所以两次返回的地址不相等
- 把指针传给函数，函数就能修改调用方的变量，比如 `heal(&hp, 15)`
- `*p` 相当于给变量起了个**别名**。别名多了，要找出“谁在改这个变量”就不容易了。slice、map、chan 这些引用类型也会产生别名

**指针的实际用途：flag 包**。标准库的 `flag` 包用指针来接收命令行参数：

```go
// greet：按命令行参数打招呼
package main

import (
	"flag"
	"fmt"
	"strings"
)

var name = flag.String("name", "同学", "要打招呼的人")
var times = flag.Int("n", 1, "重复几次")
var shout = flag.Bool("up", false, "是否转成大写")

func main() {
	flag.Parse()
	msg := "hello, " + *name
	if *shout {
		msg = strings.ToUpper(msg)
	}
	for i := 0; i < *times; i++ {
		fmt.Println(msg)
	}
	fmt.Println("其余参数：", flag.Args())
}
```

```text
$ go run . -name 小明 -n 2 -up a b
HELLO, 小明
HELLO, 小明
其余参数： [a b]

$ go run . -h
  -n int
    	重复几次 (default 1)
  -name string
    	要打招呼的人 (default "同学")
  -up
    	是否转成大写
```

- `flag.String(名字, 默认值, 说明)` 返回的是 `*string`，所以用的时候要写 `*name`
- <span style="color:#e03131">必须先调用 `flag.Parse()`</span>，变量才会从默认值更新成命令行传进来的值
- 不带 `-` 的普通参数用 `flag.Args()` 拿到，类型是 `[]string`
- 传 `-h` 会自动打印所有参数的说明

### 1.3.4 new 函数

<span style="color:#e03131">`new(T)` 创建一个 T 类型的匿名变量，初始化为零值，返回它的地址（类型 `*T`）</span>。

```go
s := new(string)
fmt.Printf("%q\n", *s) // ""
*s = "gopher"
fmt.Println(*s) // gopher

p, q := new(int), new(int)
fmt.Println(p == q) // false，每次 new 都是一个新变量
```

`new` 只是个语法糖，下面两种写法完全一样：

```go
func newCounter() *int { return new(int) }

func newCounter() *int {
	var c int
	return &c
}
```

- 实际代码里 `new` 用得不多，创建结构体通常直接写字面量 `&Point{1, 2}`
- `new` 是预定义函数，不是关键字，可以被同名变量屏蔽（比如函数参数叫 `new`），屏蔽后在那个函数里就用不了内置的 `new` 了
- 特例：大小为 0 的类型（如 `struct{}`）两次 `new` 可能拿到相同地址

### 1.3.5 变量的生命周期

- **作用域**是编译时概念：名字在源码的哪段文字里能用
- **生命周期**是运行时概念：变量在程序运行期间存活多久

<span style="color:#e03131">包级变量的生命周期和整个程序一样长；局部变量从声明语句执行开始，一直活到不再被引用为止</span>。函数参数和返回值也是局部变量，每次调用都会重新创建。

垃圾回收器怎么判断能不能回收？从所有包级变量和当前正在运行的函数的局部变量出发，顺着指针和引用往下找，<span style="color:#e03131">找不到的变量就是“不可达”的，可以回收</span>。

所以局部变量可能在函数返回后还活着。至于放栈上还是堆上，<span style="color:#e03131">由编译器的逃逸分析决定，和用 `var` 还是 `new` 无关</span>：

```go
package main

var keep *int

func save() {
	n := 42
	keep = &n // n 被包级变量引用，函数结束后还活着：逃逸到堆上
}

func temp() int {
	m := new(int) // 虽然用了 new，但 m 没被外面引用
	*m = 7
	return *m
}

func main() {
	save()
	_ = temp()
}
```

用 `go build -gcflags=-m` 可以看编译器的决定：

```text
./main.go:6:2: moved to heap: n
./main.go:11:10: new(int) does not escape
```

![逃逸分析示意图](/assets/img/go/go-escape.svg)

**图解：** 左边灰色区域是栈，函数一返回就自动回收；右边黄色区域是堆，由 GC 判断变量还能不能被访问到再决定回收。

- `temp` 里的 `m` 虽然是 `new` 出来的，但它的地址没有传到函数外面，函数一结束就没人能访问它了，所以编译器把它<span style="color:#e03131">放在栈上</span>
- `save` 里的 `n` 是普通的局部变量，但它的地址被存进了包级变量 `keep`，函数结束后还能通过 `keep` 访问到，所以编译器把它<span style="color:#e03131">“移到堆上”</span>，这就叫**逃逸**

写代码时不用刻意关心逃逸，程序都是对的。但要知道：<span style="color:#e03131">把短命对象的指针存到长命对象（尤其是全局变量）里，会让短命对象一直回收不掉</span>，影响性能。

## 1.4 赋值

```go
x = 1                // 普通变量
*p = true            // 通过指针
user.name = "bob"    // 结构体字段
stock[k] = stock[k] * 2 // 数组、slice、map 的元素
stock[k] *= 2        // 复合赋值，等价于上一行
```

`v++` 和 `v--` 在 Go 里是<span style="color:#e03131">语句，不是表达式</span>，所以 `x = i++` 编译不过，也没有 `++i` 这种前置写法。

### 1.4.1 元组赋值

<span style="color:#e03131">先把右边所有表达式都算完，再统一赋值给左边</span>。所以交换变量不需要临时变量：

```go
package main

import "fmt"

// 把整数倒过来：1234 -> 4321
func reverse(n int) int {
	rev := 0
	for n > 0 {
		n, rev = n/10, rev*10+n%10
	}
	return rev
}

func main() {
	a, b, c := 1, 2, 3
	a, b, c = b, c, a    // 先算右边 (2,3,1)，再统一赋给左边
	fmt.Println(a, b, c) // 2 3 1

	fmt.Println(reverse(1234)) // 4321
}
```

`reverse` 里的 `n, rev = n/10, rev*10+n%10`，右边用的都是这一轮**旧的** `n`，这正是元组赋值的好处。不过表达式太复杂时，还是拆成几行单独赋值更好读。

**带 ok 的双返回值**：map 查找、类型断言、通道接收这三种操作，可以多返回一个布尔值 `ok` 表示成不成功：

```go
v, ok = m[key]  // map 查找
v, ok = x.(T)   // 类型断言
v, ok = <-ch    // 通道接收
```

只接收一个值时：map 查不到返回零值；类型断言失败会 panic；通道关闭后返回零值。

```go
stock := map[string]int{"apple": 5}
n, ok := stock["apple"]
fmt.Println(n, ok) // 5 true
n, ok = stock["pear"]
fmt.Println(n, ok) // 0 false
```

不需要的值用<span style="color:#e03131">空白标识符 `_`</span> 丢掉，比如 `_, ok = stock["apple"]` 只关心存不存在，`_, err = io.Copy(dst, src)` 不关心拷了多少字节。

### 1.4.2 可赋值性

除了显式的 `=`，很多地方也在**隐式赋值**：函数调用时把实参赋给形参，`return` 把值赋给返回值，字面量 `[]string{"a", "b"}` 给每个元素赋值。

规则很简单：<span style="color:#e03131">左右两边类型必须完全一致；`nil` 可以赋给任何指针或引用类型</span>。常量的规则更宽松一些（后面讲常量时再细说）。`==` 和 `!=` 比较也要求两边类型能互相赋值。

## 1.5 类型

同样是 `float64`，可以表示公斤，也可以表示斤。如果混在一起算，就会出“10 公斤 + 8 斤 = 18”这种错误。<span style="color:#e03131">`type` 声明可以基于已有类型创建一个新的命名类型，让底层相同、含义不同的值互不兼容</span>：

```go
type 类型名 底层类型
```

例子：重量单位包（这里先看类型部分，1.6 节再看它怎么拆成两个文件）：

```go
type Kilogram float64 // 公斤
type Jin float64      // 斤

const (
	OneKg    Kilogram = 1
	RiceBag  Kilogram = 10 // 一袋米
	Watermel Jin      = 8  // 一个西瓜
)

func KgToJin(k Kilogram) Jin { return Jin(k * 2) }
func JinToKg(j Jin) Kilogram { return Kilogram(j / 2) }
```

`Kilogram` 和 `Jin` 底层都是 `float64`，但它们是**不同的类型**：

```go
rice := RiceBag
fmt.Println(rice - OneKg)          // 9，同类型可以运算
fmt.Println(rice + Watermel)        // 编译错误：mismatched types Kilogram and Jin
fmt.Println(rice + JinToKg(Watermel)) // 14，先换算再相加
fmt.Println(rice == Kilogram(Watermel)) // false（8 != 10）
```

**类型转换** `T(x)`：

- `Kilogram(x)` 长得像函数调用，但它是<span style="color:#e03131">类型转换，只改类型，不改值</span>。`Kilogram(Watermel)` 的值还是 8，所以和 10 不相等
- `KgToJin` 才是真正的换算函数，会算出新的值
- <span style="color:#e03131">只有底层类型相同（或都是指向相同底层类型的指针）才能互相转换</span>
- 数值类型之间也能转，但可能改变值：浮点转整数会丢掉小数部分；`string` 转 `[]byte` 会拷贝一份数据
- 转换失败只会在编译时报错，运行时不会失败

命名类型的运算行为和底层类型一样，`Kilogram` 能加减乘除、能用 `==` `<` 比较，前提是两边类型相同。

**给类型加方法**：在函数名前面写上接收者，就是给这个类型定义了一个方法（后面讲方法时再细说）：

```go
func (k Kilogram) String() string { return fmt.Sprintf("%g公斤", float64(k)) }
func (j Jin) String() string      { return fmt.Sprintf("%g斤", float64(j)) }
```

<span style="color:#e03131">定义了 `String()` 方法的类型，用 `fmt` 打印时会自动调用它</span>：

```go
fmt.Println(rice)                         // 10公斤
fmt.Printf("%v | %s | %g\n", rice, rice, rice) // 10公斤 | 10公斤 | 10
fmt.Println(float64(rice))                // 10
```

`%v`、`%s`、`Println` 会调用 `String()`；`%g` 按数字格式打印，不调用；转回 `float64` 后也不再调用，因为 `float64` 没有这个方法。

`String()` 里我写的是 `float64(k)`，这是个好习惯：<span style="color:#e03131">如果在 `String()` 里用 `%v` 或 `%s` 直接打印 `k` 本身，`fmt` 又会去调用 `k.String()`，就变成无限递归了</span>。先转回 `float64` 就没有这个问题。

## 1.6 包和文件

Go 的包相当于 Java 的 package 或其他语言的模块，作用是：<span style="color:#e03131">模块化、封装、单独编译、代码复用</span>。

- 一个包由同一个目录下的一个或多个 `.go` 文件组成
- 每个包是一个独立的命名空间：`image.Decode` 和 `utf16.Decode` 不会冲突
- 用首字母大小写控制哪些名字对外可见

把上面的重量单位做成一个独立的包 `weight`，分成两个文件：

```go
// weight/weight.go

// Package weight 提供公斤和斤之间的换算。
package weight

import "fmt"

type Kilogram float64 // 公斤
type Jin float64      // 斤

const (
	OneKg    Kilogram = 1
	RiceBag  Kilogram = 10 // 一袋米
	Watermel Jin      = 8  // 一个西瓜
)

func (k Kilogram) String() string { return fmt.Sprintf("%g公斤", float64(k)) }
func (j Jin) String() string      { return fmt.Sprintf("%g斤", float64(j)) }
```

```go
// weight/conv.go
package weight

// KgToJin 把公斤换算成斤。
func KgToJin(k Kilogram) Jin { return Jin(k * 2) }

// JinToKg 把斤换算成公斤。
func JinToKg(j Jin) Kilogram { return Kilogram(j / 2) }
```

- 两个文件开头都是 `package weight`，属于同一个包
- <span style="color:#e03131">同一个包的不同文件之间，包级名字可以直接互相使用</span>，`conv.go` 里直接用了 `weight.go` 里的 `Kilogram`，不用导入
- 但 `import` 是**按文件**算的：`weight.go` 用了 `fmt` 所以导入了，`conv.go` 没用到就不导入
- `package` 前面紧挨着的注释是**包注释**，第一句应该概括包的功能。一个包一般只在一个文件里写包注释，太长的话单独放到 `doc.go`

### 1.6.1 导入包

每个包有一个全局唯一的**导入路径**（如 `example.com/ch2/weight`），还有一个短的**包名**（如 `weight`）。<span style="color:#e03131">按惯例，包名就是导入路径的最后一段</span>。

```go
// wt：把命令行里的数字同时当作公斤和斤来换算
package main

import (
	"fmt"
	"os"
	"strconv"

	"example.com/ch2/weight"
)

func main() {
	for _, arg := range os.Args[1:] {
		v, err := strconv.ParseFloat(arg, 64)
		if err != nil {
			fmt.Fprintf(os.Stderr, "wt: %v\n", err)
			os.Exit(1)
		}
		k := weight.Kilogram(v)
		j := weight.Jin(v)
		fmt.Printf("%s = %s, %s = %s\n", k, weight.KgToJin(k), j, weight.JinToKg(j))
	}
}
```

```text
$ go run ./wt 1 10
1公斤 = 2斤, 1斤 = 0.5公斤
10公斤 = 20斤, 10斤 = 5公斤
```

<span style="color:#e03131">导入了包却没用，是编译错误</span>（Java 里只是警告）。调试时删了一行 `log.Print` 就得顺手删掉 `import "log"`，有点烦。解决办法是用 `goimports` 工具，保存文件时自动增删导入；`gofmt` 负责自动格式化代码。大多数编辑器（比如 VS Code 的 Go 插件）都已经集成了。

### 1.6.2 包的初始化

**第一步：包级变量按依赖顺序初始化。** 不依赖别人的先初始化，依赖别人的等别人好了再初始化，和书写顺序无关：

```go
package main

import "fmt"

var total = price * count // 第 3 个初始化：依赖 price 和 count
var price = getPrice()    // 第 2 个初始化：依赖 count
var count = 3             // 第 1 个初始化：不依赖任何人

func getPrice() int {
	fmt.Println("getPrice 被调用，此时 count =", count)
	return 10 * count
}

func init() {
	fmt.Println("init 执行：total =", total)
}

func main() {
	fmt.Println("main 执行")
}
```

```text
getPrice 被调用，此时 count = 3
init 执行：total = 90
main 执行
```

**第二步：执行 `init` 函数。** 有些初始化不是一个表达式能搞定的（比如要循环填一张表），就写在 `init()` 里：

- 每个文件可以有多个 `init`，按声明顺序自动执行
- <span style="color:#e03131">`init` 不能被调用，也不能被引用</span>
- 多个文件时，按文件名排序后的顺序初始化

```go
var weekday map[string]int // 包级变量，在 init 里填好

func init() {
	weekday = make(map[string]int)
	names := []string{"日", "一", "二", "三", "四", "五", "六"}
	for i, n := range names {
		weekday["星期"+n] = i
	}
}

func main() {
	fmt.Println(weekday["星期三"]) // 3
	fmt.Println(len(weekday))   // 7
}
```

**第三步：包与包之间自底向上。** <span style="color:#e03131">被导入的包先初始化，`main` 包最后初始化，每个包只初始化一次</span>。所以 `main` 函数开始执行时，所有依赖的包都已经准备好了。

![包的初始化顺序](/assets/img/go/go-init-order.svg)

**图解：** 左边五个方框从上往下就是上面那段程序的执行顺序。

- 蓝色的三个是包级变量。虽然源码里 `total` 写在最前面，但 `count` 谁都不依赖，所以最先初始化；`price` 依赖 `count`，排第二；`total` 依赖前两个，排最后
- 黄色的 `init()` 在所有包级变量都初始化完之后自动执行，所以它打印出的 `total` 已经是 90 了
- 红色的 `main()` 最后执行

右边说的是多个包的情况：`main` 包导入了 `fmt` 和自己写的 `weight` 包，那么 `fmt`、`weight` 会先完成初始化（它们自己也按左边这套顺序来），`main` 包排在最后。

## 1.7 作用域

<span style="color:#e03131">作用域是源代码中能使用某个名字的那段区域，是编译时概念；生命周期是变量在运行时存活的时间，是运行时概念</span>，两者不要混淆。

**词法块**：用花括号包起来的一组语句是一个块，比如函数体、循环体。还有一些没有花括号的隐式块：

| 词法块 | 里面声明的名字在哪里可见 |
| --- | --- |
| 全局块 | `int`、`len`、`true` 等内置名字，整个程序都能用 |
| 包级块 | 函数外声明的名字，同一个包的所有文件都能用 |
| 文件块 | `import` 导入的包名，<span style="color:#e03131">只在当前文件可见</span> |
| 函数块 | 函数内声明的局部变量 |
| `if`/`for`/`switch` 的隐式块 | 条件部分（如 `if x := f(); ...`）声明的变量，在整个语句里可见，包括 else 分支 |
| `switch`/`select` 每个分支 | 每个 `case` 是一个独立的块 |

另外，`break`、`continue`、`goto` 后面跟的**标号**是函数级作用域。

**查找规则**：编译器遇到一个名字，<span style="color:#e03131">从最内层的块开始往外找，找到第一个就用它</span>。内层的声明会**屏蔽**外层同名的声明；一直找到全局块都没有，就报 `undefined`。

```go
package main

import "fmt"

var level = "包级"

func main() {
	x := 10
	if x := x * 2; x > 15 { // if 的条件部分：新的 x = 20
		x := x + 1     // if 块内部：又一个新的 x = 21
		fmt.Println(x) // 21
	}
	fmt.Println(x) // 10，外面的 x 没被改

	level := "局部"      // 屏蔽了包级的 level
	fmt.Println(level) // 局部

	for _, ch := range "go" {
		ch := ch - 'a' + 'A'
		fmt.Printf("%c", ch) // GO
	}
	fmt.Println()
}
```

![词法块嵌套示意图](/assets/img/go/go-scope.svg)

**图解：** 一层套一层的方框就是一层层的词法块，最外面是全局块，往里依次是包级块、文件块、`main` 的函数块、`if` 条件部分的隐式块、`if` 花括号里的块。

- 例子里一共有**三个不同的 `x`**：函数块里的 10、`if` 条件部分的 20、`if` 花括号里的 21
- `x := x * 2` 右边的 `x` 在声明生效之前求值，所以用的是外层的 10；左边的 `x` 是条件部分新建的变量
- 最里面执行 `fmt.Println(x)` 时，从最内层往外找（红色箭头），第一个找到的是 21，外面两个 `x` 就被屏蔽了
- 出了 `if`，里面两个 `x` 都不可见了，所以最后打印 10

`for` 也一样：`for _, ch := range "go"` 的 `ch` 在隐式块里，循环体里的 `ch := ...` 又是一个新变量。这种写法只是为了演示规则，实际代码里不要这样故意重名。

**if 里声明的变量，出了 if 就用不了**：

```go
if f, err := os.Open("a.txt"); err != nil {
	return err
}
f.Close() // 编译错误：undefined: f（而且上面还会报 declared and not used: f）
```

Go 推荐的写法是在 `if` 前面声明，`if` 里只处理错误然后直接返回，这样正常流程的代码不用缩进：

```go
f, err := os.Open("a.txt")
if err != nil {
	return err
}
defer f.Close()
// 正常使用 f ...
```

**最常见的坑：`:=` 意外屏蔽了包级变量**。下面想把主机名存到包级变量 `host` 里：

```go
package main

import (
	"fmt"
	"log"
	"os"
)

var host string

func initWrong() {
	host, err := os.Hostname() // := 新建了局部 host，包级 host 没被赋值
	if err != nil {
		log.Fatal(err)
	}
	_ = host
}

func initRight() {
	var err error
	host, err = os.Hostname() // = 赋值给包级 host
	if err != nil {
		log.Fatal(err)
	}
}

func main() {
	initWrong()
	fmt.Printf("错误写法后：%q\n", host) // ""
	initRight()
	fmt.Println("正确写法后是否为空：", host == "") // false
}
```

`initWrong` 里，`host` 和 `err` 在当前函数块里都还没声明过，所以 `:=` 把它们<span style="color:#e03131">都当成新的局部变量</span>，包级的 `host` 根本没被碰到。更麻烦的是，只要局部 `host` 被用过一次（比如打印日志），编译器就不会报 `declared and not used`，bug 会藏得很深。

正确做法是<span style="color:#e03131">先单独 `var err error`，再用 `=` 赋值</span>。

## 本章小结

```text
程序结构
├── 命名
│   ├── 字母或下划线开头，区分大小写，驼峰命名
│   ├── 25 个关键字；内置名字（int、len、nil…）可以被重新定义
│   └── 包级名字首字母大写 = 导出（相当于 public）
├── 声明：var、const、type、func
│   └── 包级声明顺序无关；函数内必须先声明后使用
├── 变量
│   ├── var 名字 类型 = 表达式；省略表达式时用零值，Go 没有未初始化的变量
│   ├── :=：只能在函数内用，左边至少一个新变量
│   ├── 指针：&x 取地址，*p 读写指向的变量，零值 nil，返回局部变量地址安全
│   ├── new(T)：创建零值匿名变量，返回 *T，只是语法糖
│   └── 生命周期：包级 = 整个程序；局部 = 直到不可达；栈或堆由逃逸分析决定
├── 赋值
│   ├── ++ 和 -- 是语句不是表达式
│   ├── 元组赋值：先算完右边，再统一赋给左边
│   ├── v, ok：map 查找、类型断言、通道接收；_ 丢弃不要的值
│   └── 可赋值性：类型必须一致，nil 可赋给指针和引用类型
├── 类型
│   ├── type 新类型 底层类型：底层相同、含义不同的类型互不兼容
│   ├── T(x) 是类型转换，只改类型不改值，要求底层类型相同
│   └── 定义 String() 方法后，fmt 打印时自动调用
├── 包和文件
│   ├── 一个目录一个包；同包不同文件的包级名字直接共享，import 按文件算
│   ├── 导入路径全局唯一，包名一般是路径最后一段；导入不用会编译报错
│   └── 初始化：包级变量按依赖顺序 → init() → main；被导入的包先初始化
└── 作用域
    ├── 编译时概念，和运行时的生命周期区分
    ├── 词法块：全局 → 包 → 文件 → 函数 → if/for/switch 隐式块 → 花括号块
    ├── 从内往外查找名字，内层屏蔽外层
    └── 小心 := 新建局部变量，屏蔽了想赋值的外层变量
```
