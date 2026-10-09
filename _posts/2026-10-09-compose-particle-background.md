---
title: "Compose 粒子背景：怎么做到不卡、不费电"
date: 2026-10-09 10:00:00 +0800
categories: [安卓]
tags: [安卓, Jetpack Compose, 性能优化]
---

我在一个 Android 项目里给首页做了粒子背景：几十个小光点慢慢漂，靠得近的两点之间连一条淡淡的线。效果不难写，难的是让它<span style="color:#e03131">一直挂在首页却不卡、不费电</span>。第一版能跑，但在模拟器上直接把界面卡死，系统弹出了“应用无响应”的对话框。这篇从那个问题讲起，依次讲重绘与重组、帧循环、数据布局、绘制技巧、数量上限和“减少动画”模式，最后讲怎么验证。

## 1. 第一版为什么会卡死

第一版的写法很直觉：用一个状态记录当前帧号，每帧加一，然后把它交给画布。

```kotlin
// 反例：每一帧都会触发重组
@Composable
fun ParticleBackground(field: ParticleField) {
    var frame by remember { mutableLongStateOf(0L) }

    LaunchedEffect(Unit) {
        while (true) {
            withFrameNanos { frame++ }
        }
    }

    val currentFrame = frame          // 在组合阶段读取了状态
    Canvas(Modifier.fillMaxSize()) {
        drawParticles(field, currentFrame)   // 推进并画出粒子，具体实现见后文
    }
}
```

问题出在 `val currentFrame = frame` 这一行。Compose 的一帧分三个阶段：组合（Composition）、布局（Layout）、绘制（Drawing）。<span style="color:#e03131">状态在哪个阶段被读取，它变化时就从哪个阶段开始重新执行</span>。这里 `frame` 在组合阶段被读，于是每帧都要重组整个函数，重新创建绘制 lambda，再布局、再绘制。每秒 60 次重组叠加首页其他内容，主线程被占满，输入事件处理不过来，最终触发 ANR。

## 2. 关键修复：只重绘，不重组

修法是把状态的读取挪进 `Canvas` 的绘制 lambda 里：

```kotlin
Canvas(Modifier.fillMaxSize()) {
    if (frame < 0) return@Canvas      // 只在绘制阶段读取 frame
    drawParticles(field)
}
```

`if (frame < 0)` 永远不成立，它的唯一作用是<span style="color:#e03131">让绘制阶段订阅 `frame`</span>。这样 `frame` 每次变化，Compose 只会让这块画布的绘制失效、重新执行 draw lambda，组合和布局都不会再跑。帧号本身用 `mutableLongStateOf`，避免 `Long` 装箱。

## 3. 独立的渲染层

粒子画布外面再套一层 `graphicsLayer()`：

```kotlin
Canvas(
    Modifier
        .fillMaxSize()
        .graphicsLayer()
) { /* ... */ }
```

`graphicsLayer` 会给这块内容单独分配一个 RenderNode。粒子层和上面的首页内容各自记录自己的绘制指令：上层的文字、按钮变化时，粒子层的绘制不用重新录制；粒子每帧更新时，也只重录这一层。

## 4. 帧循环：限帧、按真实时间推进、后台彻底停下

```kotlin
private const val FRAME_INTERVAL_NANOS = 32_000_000L   // 约 30 fps

@Composable
fun ParticleBackground(field: ParticleField, modifier: Modifier = Modifier) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val primary = MaterialTheme.colorScheme.primary      // 主题色在组合阶段读取即可
    val secondary = MaterialTheme.colorScheme.tertiary
    var frame by remember { mutableLongStateOf(0L) }

    LaunchedEffect(field, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var lastStep = 0L
            while (true) {
                withFrameNanos { now ->
                    if (lastStep == 0L) {
                        lastStep = now
                    } else if (now - lastStep >= FRAME_INTERVAL_NANOS) {
                        val dt = ((now - lastStep) / 1_000_000_000f).coerceAtMost(0.1f)
                        field.step(dt)
                        lastStep = now
                        frame++
                    }
                }
            }
        }
    }

    Canvas(modifier.fillMaxSize().graphicsLayer()) {
        if (frame < 0) return@Canvas
        field.resize(size.width, size.height)
        field.draw(this, 120.dp.toPx(), primary, secondary)
    }
}
```

这段代码做了三件事：

- **跟着屏幕刷新走**：`withFrameNanos` 挂起到下一次 Choreographer 帧回调，拿到的是这一帧的时间戳，不会出现自己写 `delay` 时那种和 vsync 对不齐的抖动。
- **限到约 30 fps**：距离上一步不足 32 ms 就跳过，不推进、不改 `frame`，自然也不重绘。背景粒子动得很慢，30 fps 肉眼看不出区别，GPU 和 CPU 的工作量却直接减半。
- **按真实经过的秒数推进**：`step(dt)` 里的位移是“速度 × 秒数”，所以不管设备是 30、60 还是 120 Hz，掉不掉帧，粒子的速度都一样。`dt` 上限 0.1 秒，防止卡顿后粒子一下子跳很远。

最外层的 `repeatOnLifecycle(Lifecycle.State.STARTED)` 负责省电：页面进入后台（低于 STARTED）时，里面的协程被取消，帧循环彻底停下；回到前台再重新启动。后台没有任何定时器在空转。

## 5. 数据布局：用基本类型数组，不用粒子对象

粒子数据全部放在一个 `ParticleField` 里，用几组 `FloatArray` 按下标存储：

```kotlin
class ParticleField(val count: Int, seed: Long = 42L) {
    val x = FloatArray(count)
    val y = FloatArray(count)
    private val vx = FloatArray(count)        // 速度，单位：px / 秒
    private val vy = FloatArray(count)
    val radius = FloatArray(count)
    val tone = FloatArray(count)              // 0..1，决定用主色还是次色

    private val random = Random(seed)
    private var width = 0f
    private var height = 0f

    fun resize(w: Float, h: Float) {
        if (w == width && h == height) return
        width = w
        height = h
        for (i in 0 until count) {
            x[i] = random.nextFloat() * w
            y[i] = random.nextFloat() * h
            vx[i] = (random.nextFloat() - 0.5f) * 24f
            vy[i] = (random.nextFloat() - 0.5f) * 24f
            radius[i] = 1.5f + random.nextFloat() * 2f
            tone[i] = random.nextFloat()
        }
    }

    fun step(dt: Float) {
        for (i in 0 until count) {
            x[i] += vx[i] * dt
            y[i] += vy[i] * dt
            if (x[i] < 0f || x[i] > width) vx[i] = -vx[i]
            if (y[i] < 0f || y[i] > height) vy[i] = -vy[i]
        }
    }
}
```

如果写成 `List<Particle>`，每个粒子都是一个对象，数据散落在堆上；每帧再 `copy()` 一下，就会持续产生垃圾，触发 GC 停顿。改成 `FloatArray` 后，<span style="color:#e03131">没有逐个粒子的对象，每帧也不分配任何内存</span>，遍历时数据还是连续的，对 CPU 缓存更友好。

## 6. 绘制：比较平方距离，三个同心圆假装发光

```kotlin
fun ParticleField.draw(
    scope: DrawScope,
    linkDistancePx: Float,
    primary: Color,
    secondary: Color,
) = with(scope) {
    val link2 = linkDistancePx * linkDistancePx

    // 连线：两两比较，O(n²)
    for (i in 0 until count) {
        for (j in i + 1 until count) {
            val dx = x[i] - x[j]
            val dy = y[i] - y[j]
            val d2 = dx * dx + dy * dy
            if (d2 < link2) {
                drawLine(
                    color = primary,
                    start = Offset(x[i], y[i]),
                    end = Offset(x[j], y[j]),
                    strokeWidth = 1f,
                    alpha = (1f - d2 / link2) * 0.22f,
                )
            }
        }
    }

    // 粒子：三个同心圆叠出光晕
    for (i in 0 until count) {
        val c = if (tone[i] < 0.5f) primary else secondary
        val center = Offset(x[i], y[i])
        drawCircle(c, radius = radius[i] * 3.2f, center = center, alpha = 0.18f)
        drawCircle(c, radius = radius[i] * 1.8f, center = center, alpha = 0.35f)
        drawCircle(c, radius = radius[i], center = center, alpha = 1f)
    }
}
```

颜色在组合阶段从 `MaterialTheme.colorScheme` 取出，再传进 draw lambda。主题颜色不会每帧变化，在组合阶段读取没有问题，真正每帧变化的只有 `frame`。

几个细节：

- **不开方**：判断“距离是否小于连线距离”，等价于“距离的平方是否小于连线距离的平方”。`sqrt` 在双重循环里会被调用上千次，比较平方值可以完全省掉它。
- **线越远越淡**：透明度是 `(1 - d²/link²) * 0.22`。两点重合时最实，接近连线距离时淡到 0，线条是渐渐出现、渐渐消失的，不会突然闪一下。直接用 d² 而不是 d，衰减曲线略有不同，但视觉上看不出来，还能顺便省掉开方。
- **连线距离用 dp**：`120.dp.toPx()` 让不同密度的屏幕上连线的“视觉长度”一致。
- **不用模糊做光晕**：每个粒子画三个同心圆，半径分别是 ×3.2、×1.8、×1，透明度分别是 0.18、0.35、1.0。叠在一起像发光，但只是三次普通的圆形绘制，比 `BlurMaskFilter` 或 `Modifier.blur` 便宜得多。
- **颜色来自 MaterialTheme**：浅色和深色主题都能直接适配，不用写两套颜色。

## 7. 为什么要限制粒子数量

连线是两两比较，n 个粒子要比较 n(n-1)/2 次，是 O(n²)：

| 粒子数 | 比较次数 |
| :----: | :------: |
| 30     | 435      |
| 60     | 1,770    |
| 120    | 7,140    |
| 240    | 28,680   |

粒子数翻一倍，计算量和潜在的连线数量就翻四倍。所以默认上限定在 60 个左右：60 个粒子最多约 1,770 条线，加上 180 个圆，每帧大约 2,000 次绘制调用，在 30 fps 下对中低端机也很轻松。设置里提供低、中、高三档密度，还可以一键关闭粒子背景，把选择权留给用户。

## 8. 系统关闭动画时，只画一张静态图

有些用户会在开发者选项里把“动画时长缩放”设为 0，或者开启无障碍里的“移除动画”。这时候背景还在动就不合适了。判断方法是读 `Settings.Global.ANIMATOR_DURATION_SCALE`：

```kotlin
@Composable
fun rememberReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    var reduced by remember { mutableStateOf(false) }
    // 用户可能切出去改了设置再回来，所以每次 resume 都重新读一次
    LifecycleResumeEffect(resolver) {
        reduced = Settings.Global.getFloat(
            resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f
        ) == 0f
        onPauseOrDispose { }
    }
    return reduced
}
```

减少动画模式下，<span style="color:#e03131">不启动帧循环</span>，而是在 `drawWithCache` 里用 `CanvasDrawScope` 把整片粒子画进一张 `ImageBitmap`，之后每次绘制只贴这张图：

```kotlin
@Composable
fun StillParticleBackground(field: ParticleField, modifier: Modifier = Modifier) {
    val primary = MaterialTheme.colorScheme.primary
    val secondary = MaterialTheme.colorScheme.tertiary

    Spacer(
        modifier
            .fillMaxSize()
            .drawWithCache {
                val bitmap = ImageBitmap(size.width.toInt(), size.height.toInt())
                field.resize(size.width, size.height)
                CanvasDrawScope().draw(
                    density = this,
                    layoutDirection = layoutDirection,
                    canvas = Canvas(bitmap),
                    size = size,
                ) {
                    field.draw(this, 120.dp.toPx(), primary, secondary)
                }
                onDrawBehind { drawImage(bitmap) }
            }
    )
}
```

`drawWithCache` 里的内容只在尺寸变化或读取的状态变化时才重新执行，平时只走 `onDrawBehind`。于是每次绘制从“约 2,000 条线和圆”变成“一张图”。颜色在组合阶段读取并被 lambda 捕获，切换深浅色主题时会重新生成这张图。

在使用的地方二选一即可：

```kotlin
if (rememberReducedMotion()) {
    StillParticleBackground(field)
} else {
    ParticleBackground(field)
}
```

## 9. 怎么验证

光靠“感觉不卡”不够，我在模拟器上写了自动化测试检查两件事：

- **静态模式真的静止**：开启减少动画后，隔一段时间连续截几张屏，逐像素比较，没有任何差异，说明没有帧循环在偷偷重绘。
- **没有 ANR**：动画模式下让首页跑一段时间，再检查系统日志，没有出现这个应用的 ANR 记录。第一版正是在这一步暴露问题的。

## 总结

- 让动画状态<span style="color:#e03131">只在绘制阶段被读取</span>，每帧只重绘、不重组，这是从卡死到流畅的关键一步。
- 粒子放在独立的 `graphicsLayer` 上，和上层内容互不影响。
- `withFrameNanos` + `repeatOnLifecycle(STARTED)` 驱动帧循环，限到约 30 fps，按真实时间推进，后台彻底停下。
- `FloatArray` 存数据，每帧零分配；比较平方距离省掉开方，同心圆代替模糊做光晕。
- O(n²) 的连线决定了粒子数必须设上限，并把密度和开关交给用户。
- 系统关闭动画时不跑帧循环，只画一张缓存好的静态图。
