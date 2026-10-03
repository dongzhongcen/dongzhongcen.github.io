---
title: "RabbitMQ（二）：核心概念、AMQP 协议与快速上手"
date: 2026-10-03 20:30:00 +0800
categories: [RabbitMQ]
tags: [MQ, 消息队列, RabbitMQ, AMQP, 生产者, 消费者]
---

上一篇知道了 MQ 是什么、RabbitMQ 有什么特点。这一篇先把 RabbitMQ 里的专业术语一个个讲清楚，再看一条消息在 RabbitMQ 里是怎么流转的、它遵守的 AMQP 协议长什么样，最后用 Java 写出第一个生产者和消费者。

## 2.1 先用寄信来理解

RabbitMQ 的术语很多，直接背容易混。其实它的工作方式和<span style="color:#e03131">寄信</span>几乎一模一样：

![用寄信来理解 RabbitMQ](/assets/img/mq/rmq2-post-office.svg)

**图解：** 寄件人（Producer）把信送到邮局（Broker）；邮局分成几个互不相干的分局（Virtual Host），分局里的分拣员（Exchange）看信封上的地址（RoutingKey），按分拣规则（Binding）把信放进对应的信箱（Queue）；收件人（Consumer）再从自己的信箱里取信。去邮局要走路（Connection），一条路上又分出很多车道（Channel）。

| 寄信 | RabbitMQ | 一句话解释 |
| --- | --- | --- |
| 寄件人 | Producer 生产者 | 发送消息的一方 |
| 收件人 | Consumer 消费者 | 接收消息的一方 |
| 邮局 | Broker | RabbitMQ 服务器本身 |
| 邮局的分局 | Virtual Host | 一个 Broker 里逻辑隔离的多个“小 RabbitMQ” |
| 分拣员 | Exchange 交换机 | 决定消息该去哪个队列 |
| 信箱 | Queue 队列 | 真正存放消息的地方 |
| 分拣规则 | Binding 绑定 | 把交换机和队列关联起来的规则 |
| 信封上的地址 | RoutingKey 路由键 | 交换机分拣时看的“地址” |
| 去邮局的路 | Connection 连接 | 客户端和 Broker 之间的 TCP 连接 |
| 路上的车道 | Channel 信道 | 一条连接上的多条逻辑通道 |

## 2.2 核心概念详解

### 2.2.1 Producer 和 Consumer

- **Producer（生产者）**：发送消息的应用，比如下单后发出“订单已创建”消息的订单服务。
- **Consumer（消费者）**：接收并处理消息的应用，比如收到消息后去扣库存的库存服务。

注意，<span style="color:#e03131">生产者和消费者都是 RabbitMQ 服务器的客户端</span>，它们之间并不直接通信。就像寄件人和收件人不用见面，信都经过邮局中转。同一个应用既可以当生产者，也可以当消费者。

消息本身分两部分：<span style="color:#e03131">消息体（payload）</span>是真正要传的内容，可以是字符串、JSON，也可以是任意二进制；<span style="color:#e03131">标签（label）</span>描述这条消息，比如交换机名、路由键，RabbitMQ 靠它决定把消息发给谁。消费者收到时只拿到消息体，标签在路由时就用完了。

### 2.2.2 Connection 和 Channel

- **Connection（连接）**：客户端和 Broker 之间的一条 <span style="color:#e03131">TCP 连接</span>。
- **Channel（信道）**：建立在 Connection 之上的<span style="color:#e03131">逻辑连接</span>，客户端的每一条命令（声明队列、发消息、收消息）都是通过 Channel 完成的。

为什么不让 Connection 直接发消息，而要多一层 Channel？

1. **TCP 连接很贵**：建一条连接要三次握手、账号认证、协议协商，还占服务器的文件句柄。一个应用往往有很多线程在收发消息，每个线程各建一条连接，连接数会成倍增加，服务器扛不住。
2. **多个线程直接共用一条连接会乱**：不同线程的数据混在一起，服务器分不清哪条命令是谁的，只能加锁让线程排队，就失去了并发。
3. **Channel 解决了这两个问题**：Channel 开关几乎没有成本，<span style="color:#e03131">每一帧数据都带着自己的 Channel 编号</span>，所以一条 TCP 连接上可以同时跑很多个 Channel，服务器按编号分开处理（这叫多路复用）。
4. **出错互不影响**：每个 Channel 有自己独立的状态（订阅了哪些队列、消息确认到第几条）。<span style="color:#e03131">某个 Channel 出错只会关掉它自己</span>，比如重复声明队列但参数对不上，整条连接和其他 Channel 照常工作。

其实按照 AMQP 协议，连接本身就不负责传消息，编号 0 的通道专门留给“打开连接、关闭连接”这类控制命令。

![一个 Connection，多个 Channel](/assets/img/mq/rmq2-conn-channel.svg)

**图解：** 应用里有 3 个线程，它们没有各自建 TCP 连接，而是共用一条 Connection，每个线程用自己的 Channel 1、2、3。就像<span style="color:#e03131">一条路上划出多条车道</span>：路只修一条，每辆车走自己的车道，互不干扰。一般的做法是<span style="color:#e03131">一个线程一个 Channel</span>，Channel 不要在多个线程之间共享。

### 2.2.3 Broker 和 Virtual Host

- **Broker**：接收和分发消息的应用，就是 RabbitMQ 服务器本身，相当于整个邮局。
- **Virtual Host（虚拟主机）**：一个 Broker 里可以有<span style="color:#e03131">多个虚拟主机，彼此逻辑隔离</span>。每个虚拟主机有自己的交换机、队列和权限，就像同一个邮局分成几个独立分局，A 分局的信箱和 B 分局的信箱互不相通。

这样多个项目、多个团队可以共用一台 RabbitMQ，又互不干扰：给每个项目一个虚拟主机，再给每个用户只授权它能访问的虚拟主机。RabbitMQ 安装后默认有一个名字叫 `/` 的虚拟主机。

### 2.2.4 Queue

**Queue（队列）**是 RabbitMQ 里<span style="color:#e03131">真正存放消息的地方</span>，相当于信箱。消息在队列里排队，等消费者来取。

- 多个消费者可以订阅同一个队列，这时队列里的消息会<span style="color:#e03131">轮流分给这些消费者</span>，每条消息只会被其中一个处理，不会每个人都收到一份。
- 一个消费者也可以同时订阅多个队列。

### 2.2.5 Exchange

**Exchange（交换机）**相当于邮局的分拣员。<span style="color:#e03131">生产者从来不直接把消息发到队列，而是发给交换机</span>，由交换机按规则把消息路由到一个或多个队列；找不到匹配的队列，消息默认就被丢弃。

RabbitMQ 有四种交换机，区别在于“按什么规则分拣”：

| 类型 | 分拣规则 | 比喻 |
| --- | --- | --- |
| fanout | 不看地址，发给所有绑定的队列 | 群发传单，每个信箱塞一份 |
| direct | RoutingKey 和 BindingKey 完全一致才投递 | 按门牌号精确投递 |
| topic | 按通配符匹配，如 `order.*` | 按“某某小区所有楼”投递 |
| headers | 按消息头属性匹配，用得很少 | 按信封上的其他标记投递 |

每种交换机的具体用法后面单独写。这一篇的例子只用 RabbitMQ 自带的<span style="color:#e03131">默认交换机</span>：它的名字是空字符串 `""`，所有队列都自动和它绑定，BindingKey 就是队列名。所以<span style="color:#e03131">发消息时路由键写队列名，消息就会进到同名队列</span>。

### 2.2.6 Binding 和 RoutingKey

- **Binding（绑定）**：交换机和队列之间的关联规则，绑定时可以指定一个 **BindingKey**。相当于给分拣员定规则：“地址写着 A 的信放进 1 号信箱”。
- **RoutingKey（路由键）**：生产者发消息时附带的“地址”。交换机拿 RoutingKey 和各个绑定的 BindingKey 比对（比对方式由交换机类型决定），决定消息去哪些队列。

简单说：<span style="color:#e03131">BindingKey 是信箱上贴的标签，RoutingKey 是信封上写的地址</span>，两者对得上，信就放进这个信箱。

### 2.2.7 常用端口

| 端口 | 用途 |
| --- | --- |
| <span style="color:#e03131">5672</span> | 客户端（生产者、消费者）和服务器建立连接的端口，代码里连的就是它 |
| 15672 | Web 管理界面的端口，浏览器访问 `http://IP:15672` |
| 25672 | 集群节点之间通信、命令行工具使用的端口 |

写代码时最常见的错误就是把端口写成 15672，那是网页用的，客户端连不上。

## 2.3 工作流程

把上面的概念串起来，就是一条消息完整的旅程：

![RabbitMQ 工作流程](/assets/img/mq/rmq2-workflow.svg)

**图解：** 左边两个生产者通过各自的 Connection 和 Channel 连到 Broker。Broker 里有多个 Virtual Host，展开的这个里面有两个交换机，红色箭头是 Binding：上面的交换机绑了两个队列，下面的绑了一个。右边消费者同样通过 Connection 和 Channel 订阅队列。下方四步就是消息的完整路线。

**生产者发消息：**

1. 连接到 Broker，建立一个 Connection，再开启一个 Channel；
2. 声明交换机和队列，并用 Binding 把它们绑起来（已存在就跳过）；
3. 把消息发给交换机，带上 RoutingKey；
4. 交换机按 RoutingKey 和 Binding 找到匹配的队列，把消息存进去；找不到就丢弃（或退回给生产者）；
5. 关闭 Channel 和 Connection。

**消费者收消息：**

1. 同样建立 Connection，开启 Channel；
2. 向 Broker 订阅某个队列，并设置收到消息后的回调；
3. 队列里有消息时，Broker 把消息<span style="color:#e03131">推送</span>给消费者；
4. 消费者处理完后<span style="color:#e03131">确认（ack）</span>，Broker 把这条消息从队列里删除；
5. 关闭 Channel 和 Connection（真实项目里消费者通常一直运行）。

## 2.4 AMQP 协议

### 2.4.1 AMQP 是什么

**AMQP（Advanced Message Queuing Protocol，高级消息队列协议）**是一个<span style="color:#e03131">面向消息中间件的开放标准应用层协议</span>，规定了客户端和消息服务器之间怎么通信。它最早由摩根大通在 2003 年发起，目的是让不同厂商的消息中间件能互相通信，不被某家产品绑死。

打个比方：AMQP 就像全国统一的<span style="color:#e03131">邮政规范</span>，信封怎么写、邮编怎么填、邮局怎么分拣都有规定。只要按这个规范来，不管用什么语言写客户端，都能和支持 AMQP 的服务器对话。RabbitMQ 就是按 AMQP 0-9-1 实现的，它的交换机、队列、绑定这些概念，就是直接来自 AMQP 定义的模型。

### 2.4.2 AMQP 的三层结构

![AMQP 协议的三层结构](/assets/img/mq/rmq2-amqp-layers.svg)

**图解：** AMQP 从上到下分三层。

- <span style="color:#e03131">功能层（Module Layer）</span>：定义客户端能调用的命令，比如声明队列 `queue.declare`、发布消息 `basic.publish`、订阅队列 `basic.consume`。我们写代码时调的方法，对应的就是这一层的命令。
- 会话层（Session Layer）：负责把命令从客户端送到服务器、再把应答送回来，处理请求和应答的同步、错误。
- 传输层（Transport Layer）：把数据切成<span style="color:#e03131">帧（Frame）</span>在 TCP 上传输，每一帧都带着 Channel 编号，Channel 的多路复用就是在这一层实现的。

### 2.4.3 代码和 AMQP 命令的对应关系

Java 客户端的方法和 AMQP 命令几乎是一一对应的：

| Java 方法 | AMQP 命令 | 作用 |
| --- | --- | --- |
| `factory.newConnection()` | `connection.start` / `connection.open` 等 | 建立连接、认证、选虚拟主机 |
| `connection.createChannel()` | `channel.open` | 开启信道 |
| `channel.exchangeDeclare()` | `exchange.declare` | 声明交换机 |
| `channel.queueDeclare()` | `queue.declare` | 声明队列 |
| `channel.queueBind()` | `queue.bind` | 绑定交换机和队列 |
| `channel.basicPublish()` | `basic.publish` | 发送消息 |
| `channel.basicConsume()` | `basic.consume` | 订阅队列，之后服务器用 `basic.deliver` 推消息 |
| `channel.basicAck()` | `basic.ack` | 确认消息 |
| `channel.close()` / `connection.close()` | `channel.close` / `connection.close` | 关闭信道、连接 |

## 2.5 快速上手：准备工作

### 2.5.1 创建虚拟主机和用户

默认的 `guest` 账号只能从本机登录，所以一般会新建一个用户，并给它一个专用的虚拟主机。可以在管理界面（`http://IP:15672`）的 Admin 页面里点出来，也可以用命令：

```bash
rabbitmqctl add_vhost study                                  # 创建虚拟主机 study
rabbitmqctl add_user study study123                          # 创建用户 study，密码 study123
rabbitmqctl set_user_tags study administrator                # 设为管理员，可以登录管理界面
rabbitmqctl set_permissions -p study study ".*" ".*" ".*"    # 授予 study 在虚拟主机 study 上的全部权限
```

`set_permissions` 后面三个 `".*"` 分别是配置、写、读权限，`.*` 表示所有资源都可以。

### 2.5.2 引入依赖

新建一个 Maven 项目，在 `pom.xml` 里加上 RabbitMQ 官方的 Java 客户端：

```xml
<dependency>
    <groupId>com.rabbitmq</groupId>
    <artifactId>amqp-client</artifactId>
    <version>5.21.0</version>
</dependency>
```

## 2.6 生产者代码

![生产者与消费者的代码步骤](/assets/img/mq/rmq2-code-steps.svg)

**图解：** 左边是生产者的 6 步，右边是消费者的 5 步。<span style="color:#e03131">前两步完全一样</span>：建立连接、开启信道。红色那一步是两边真正不同的地方：生产者 `basicPublish` 发消息，消费者 `basicConsume` 收消息。两边都声明了同一个队列，所以谁先启动都不会出错。

生产者按 6 步来写：

```java
package com.dzcs.rabbitmq;

import com.rabbitmq.client.Channel;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;

import java.nio.charset.StandardCharsets;

public class ProducerDemo {
    public static void main(String[] args) throws Exception {
        // 1. 建立连接：告诉工厂 RabbitMQ 在哪、用哪个账号、进哪个虚拟主机
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost("127.0.0.1");   // RabbitMQ 所在机器的 IP
        factory.setPort(5672);          // 客户端连接端口（不是 15672 管理界面端口）
        factory.setUsername("study");   // 账号
        factory.setPassword("study123"); // 密码
        factory.setVirtualHost("study"); // 虚拟主机
        Connection connection = factory.newConnection();

        // 2. 开启信道：真正收发消息都通过 Channel
        Channel channel = connection.createChannel();

        // 3. 声明交换机：这里使用内置的默认交换机（名字是空字符串），不用自己声明

        // 4. 声明队列：队列不存在就创建，已存在且参数一致就什么也不做
        //    参数：队列名, 是否持久化, 是否独占, 是否自动删除, 其他参数
        channel.queueDeclare("hello", true, false, false, null);

        // 5. 发送消息
        //    参数：交换机名, 路由键, 消息属性, 消息体
        //    使用默认交换机时，路由键写队列名，消息就会被投递到同名队列
        for (int i = 1; i <= 3; i++) {
            String msg = "第 " + i + " 封信：你好，RabbitMQ";
            channel.basicPublish("", "hello", null, msg.getBytes(StandardCharsets.UTF_8));
            System.out.println("[生产者] 已发送：" + msg);
        }

        // 6. 释放资源：先关信道，再关连接
        channel.close();
        connection.close();
    }
}
```

几个需要注意的参数：

**`queueDeclare(队列名, durable, exclusive, autoDelete, arguments)`**

- `durable`：是否持久化。`true` 表示 RabbitMQ 重启后队列还在。注意这只保证队列本身还在，消息要不丢还得把消息也设成持久化，后面再讲。
- `exclusive`：是否独占。`true` 表示只有当前连接能用，连接一断队列就删除。
- `autoDelete`：是否自动删除。`true` 表示最后一个消费者断开后自动删除队列。
- `arguments`：其他参数，比如消息过期时间、队列最大长度，暂时传 `null`。

<span style="color:#e03131">队列不存在就创建，已存在且参数一致就什么也不做</span>；如果已存在但参数不一致，会报错，并且这个 Channel 会被关闭。

**`basicPublish(交换机名, 路由键, 消息属性, 消息体)`**

- 交换机名写 `""`，表示使用默认交换机；
- 路由键写队列名 `hello`，默认交换机就会把消息投到 `hello` 队列；
- 消息体是 `byte[]`，所以字符串要先 `getBytes`。

运行生产者：

```text
[生产者] 已发送：第 1 封信：你好，RabbitMQ
[生产者] 已发送：第 2 封信：你好，RabbitMQ
[生产者] 已发送：第 3 封信：你好，RabbitMQ
```

这时还没有消费者，消息就<span style="color:#e03131">存在队列里等着</span>。打开管理界面的 Queues 页面（或者执行 `rabbitmqctl list_queues -p study`），能看到 `hello` 队列里有 3 条消息：

```text
name	messages
hello	3
```

## 2.7 消费者代码

消费者按 5 步来写：

```java
package com.dzcs.rabbitmq;

import com.rabbitmq.client.AMQP;
import com.rabbitmq.client.Channel;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;
import com.rabbitmq.client.DefaultConsumer;
import com.rabbitmq.client.Envelope;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class ConsumerDemo {
    public static void main(String[] args) throws Exception {
        // 1. 建立连接：参数和生产者一致
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost("127.0.0.1");
        factory.setPort(5672);
        factory.setUsername("study");
        factory.setPassword("study123");
        factory.setVirtualHost("study");
        Connection connection = factory.newConnection();

        // 2. 开启信道
        Channel channel = connection.createChannel();

        // 3. 声明队列：消费者也声明一次，防止消费者先启动时队列还不存在
        channel.queueDeclare("hello", true, false, false, null);

        // 4. 消费消息：DefaultConsumer 的 handleDelivery 会在消息到达时被回调
        DefaultConsumer consumer = new DefaultConsumer(channel) {
            @Override
            public void handleDelivery(String consumerTag, Envelope envelope,
                                       AMQP.BasicProperties properties, byte[] body) throws IOException {
                String msg = new String(body, StandardCharsets.UTF_8);
                System.out.println("[消费者] 收到：" + msg);
            }
        };
        //    参数：队列名, 是否自动确认, 回调对象
        channel.basicConsume("hello", true, consumer);

        // 等一会儿再退出，让回调有时间执行（真实项目里消费者会一直运行）
        Thread.sleep(2000);

        // 5. 释放资源
        channel.close();
        connection.close();
    }
}
```

**`basicConsume(队列名, autoAck, 回调对象)`**

- `autoAck`：是否自动确认。`true` 表示消息一推给消费者，RabbitMQ 就认为它处理完了，直接从队列删除。简单但不安全：消费者处理到一半崩了，这条消息就丢了。后面讲消息可靠性时会改成手动确认。
- 回调对象：继承 `DefaultConsumer` 并重写 `handleDelivery`，<span style="color:#e03131">每收到一条消息，RabbitMQ 客户端就调用一次这个方法</span>，`body` 就是消息体。

`basicConsume` 本身不会阻塞，它只是告诉 Broker “我订阅这个队列了”，消息是在后台线程里通过回调送来的。所以 `main` 里要 `sleep` 一会儿，不然程序直接关掉连接退出，就什么都收不到了。

运行消费者：

```text
[消费者] 收到：第 1 封信：你好，RabbitMQ
[消费者] 收到：第 2 封信：你好，RabbitMQ
[消费者] 收到：第 3 封信：你好，RabbitMQ
```

再看队列，消息数变成了 0：消息被消费并确认后，就从队列里删除了。这时再运行一次消费者，什么也收不到，因为信箱已经空了。

```text
name	messages
hello	0
```

## 本章小结

```text
RabbitMQ（二）
├── 寄信比喻
│   ├── 寄件人 Producer / 收件人 Consumer / 邮局 Broker
│   ├── 分局 Virtual Host / 分拣员 Exchange / 信箱 Queue
│   └── 分拣规则 Binding / 地址 RoutingKey / 路 Connection / 车道 Channel
├── 核心概念
│   ├── 生产者和消费者都是 Broker 的客户端，彼此不直接通信
│   ├── Connection 是 TCP 连接，Channel 是其上的逻辑通道，一个线程一个 Channel
│   ├── Virtual Host 逻辑隔离，各有自己的交换机、队列和权限
│   ├── 生产者只发给 Exchange，Exchange 按 Binding 路由到 Queue
│   ├── 四种交换机：fanout、direct、topic、headers
│   └── 端口：5672 客户端连接，15672 管理界面，25672 集群
├── 工作流程
│   ├── 生产者：连接 → 信道 → 声明 → 发送到交换机 → 路由进队列
│   └── 消费者：连接 → 信道 → 订阅队列 → 推送 → 确认后删除
├── AMQP 协议
│   ├── 开放标准的应用层消息协议，RabbitMQ 实现的是 0-9-1
│   ├── 三层：功能层（命令）、会话层（请求应答）、传输层（帧）
│   └── Java 方法和 AMQP 命令一一对应
└── 快速上手
    ├── 准备：创建虚拟主机、用户，引入 amqp-client
    ├── 生产者：建立连接 → 开启信道 → 声明交换机 → 声明队列 → basicPublish → 释放资源
    └── 消费者：建立连接 → 开启信道 → 声明队列 → basicConsume + handleDelivery → 释放资源
```
