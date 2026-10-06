---
title: "MySQL 高阶（一）：存储过程"
date: 2026-10-06 09:50:00 +0800
categories: [MySQL]
tags: [MySQL, 存储过程, 存储函数, 触发器, 游标]
---

平时写 SQL，都是一条一条发给数据库执行。业务一复杂，一个功能可能要连续发好几条 SQL，中间还要根据上一条的结果做判断。存储过程就是把这一串 SQL 和判断逻辑提前写好、存进数据库里，以后用一个名字调用。这一篇从存储过程的语法讲起，依次讲变量、条件判断、参数、循环、游标、条件处理程序，最后讲和它关系很近的存储函数和触发器。

文中所有 SQL 都在 MySQL 8 里实际跑过，代码块下面贴的就是真实的执行结果。

## 1.1 初识存储过程

### 1.1.1 存储过程是什么

<span style="color:#e03131">存储过程是事先编译好、存放在数据库里的一组 SQL 语句的集合。</span>调用它的时候，数据库直接执行里面的全部语句，客户端只需要发一句 `CALL 过程名()`。

可以把它理解成数据库里的“函数”：里面可以声明变量、写 `IF` 判断、写循环，还能接收参数、返回结果。

### 1.1.2 为什么要用存储过程

| 特点 | 说明 |
| --- | --- |
| <span style="color:#e03131">封装、复用</span> | 一段业务逻辑写一次，以后谁要用就 `CALL` 一下 |
| <span style="color:#e03131">减少网络交互</span> | 原来要来回发好几条 SQL，现在只发一条 `CALL`，中间结果都留在数据库里 |
| <span style="color:#e03131">可以接收参数、返回数据</span> | 有 `IN`、`OUT`、`INOUT` 三种参数，用起来像普通函数 |

当然它也有代价：逻辑写进了数据库，调试和版本管理都不如写在应用代码里方便，换数据库时也要重写。所以存储过程适合那些和数据贴得很紧、需要一次处理大量数据的逻辑。

## 1.2 环境准备

后面所有例子都用同一套表：一张学生表 `student`，一张成绩表 `score`。

```sql
DROP DATABASE IF EXISTS school;
CREATE DATABASE school DEFAULT CHARSET utf8mb4;
```

```sql
CREATE TABLE student (
  id         INT PRIMARY KEY,
  name       VARCHAR(20) NOT NULL,
  gender     CHAR(1)     NOT NULL,
  class_name VARCHAR(20) NOT NULL
);

CREATE TABLE score (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT         NOT NULL,
  course     VARCHAR(20) NOT NULL,
  score      INT         NOT NULL
);

INSERT INTO student VALUES
  (1, '张三', '男', '一班'),
  (2, '李四', '女', '一班'),
  (3, '王五', '男', '二班'),
  (4, '赵六', '女', '二班'),
  (5, '孙七', '男', '三班');

INSERT INTO score (student_id, course, score) VALUES
  (1, '数学', 92), (1, '语文', 85),
  (2, '数学', 78), (2, '语文', 90),
  (3, '数学', 56), (3, '语文', 72),
  (4, '数学', 88), (4, '语文', 64),
  (5, '数学', 45), (5, '语文', 58);

SELECT * FROM student;
SELECT * FROM score;
```

执行结果：

```text
+----+--------+--------+------------+
| id | name   | gender | class_name |
+----+--------+--------+------------+
|  1 | 张三   | 男     | 一班       |
|  2 | 李四   | 女     | 一班       |
|  3 | 王五   | 男     | 二班       |
|  4 | 赵六   | 女     | 二班       |
|  5 | 孙七   | 男     | 三班       |
+----+--------+--------+------------+
+----+------------+--------+-------+
| id | student_id | course | score |
+----+------------+--------+-------+
|  1 |          1 | 数学   |    92 |
|  2 |          1 | 语文   |    85 |
|  3 |          2 | 数学   |    78 |
|  4 |          2 | 语文   |    90 |
|  5 |          3 | 数学   |    56 |
|  6 |          3 | 语文   |    72 |
|  7 |          4 | 数学   |    88 |
|  8 |          4 | 语文   |    64 |
|  9 |          5 | 数学   |    45 |
| 10 |          5 | 语文   |    58 |
+----+------------+--------+-------+
```

五个学生，每人一门数学、一门语文。后面讲到的平均分、及格名单、总分排名，都是从这十行成绩里算出来的。

## 1.3 存储过程的基本语法

### 1.3.1 创建、调用、查看、删除

| 操作 | 语法 |
| --- | --- |
| 创建 | `CREATE PROCEDURE 过程名([参数列表]) BEGIN ... END` |
| 调用 | `CALL 过程名([参数])` |
| 查看 | 查 `information_schema.routines` 表，或 `SHOW CREATE PROCEDURE 过程名` |
| 删除 | `DROP PROCEDURE [IF EXISTS] 过程名` |

先写一个最简单的存储过程，统计学生人数：

```sql
DELIMITER $$
CREATE PROCEDURE p_student_count()
BEGIN
  SELECT COUNT(*) AS 学生人数 FROM student;
END$$
DELIMITER ;

CALL p_student_count();

SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'school';

DROP PROCEDURE IF EXISTS p_student_count;

SELECT COUNT(*) AS 剩余存储过程数
FROM information_schema.routines
WHERE routine_schema = 'school';
```

执行结果：

```text
+--------------+
| 学生人数     |
+--------------+
|            5 |
+--------------+
+-----------------+--------------+
| ROUTINE_NAME    | ROUTINE_TYPE |
+-----------------+--------------+
| p_student_count | PROCEDURE    |
+-----------------+--------------+
+-----------------------+
| 剩余存储过程数        |
+-----------------------+
|                     0 |
+-----------------------+
```

可以看到：`CALL` 之后得到了 5；创建之后在 `information_schema.routines` 里能查到 `p_student_count`，类型是 `PROCEDURE`；删除之后就查不到了。

### 1.3.2 为什么要写 DELIMITER

MySQL 命令行默认把分号 `;` 当作一条语句的结束。存储过程的 `BEGIN ... END` 里面本身就有分号，如果不改结束符，客户端读到第一个分号就把半截过程发给服务器了。

不写 `DELIMITER` 直接创建，会是这样：

```sql
CREATE PROCEDURE p_bad()
BEGIN
  SELECT COUNT(*) FROM student;
END;
```

执行结果：

```text
ERROR 1064 (42000) at line 1: You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '' at line 3
ERROR 1064 (42000) at line 4: You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'END' at line 1
```

服务器先收到了 `CREATE PROCEDURE ... SELECT COUNT(*) FROM student`，缺了 `END`，报语法错误；剩下的 `END` 又被当成单独一条语句，再报一次错。

所以<span style="color:#e03131">在命令行里创建存储过程，前面要用 `DELIMITER $$` 把结束符临时改成 `$$`，`END` 后面写 `$$`，最后再用 `DELIMITER ;` 改回来。</span>后面所有例子都是这样写的，直接复制到命令行就能运行。

## 1.4 系统变量

变量分三种：系统变量、用户自定义变量、局部变量。先看系统变量。

<span style="color:#e03131">系统变量是 MySQL 服务器自己提供的变量</span>，不是我们定义的。它又分两种：

| 种类 | 关键字 | 作用范围 |
| --- | --- | --- |
| <span style="color:#e03131">全局变量</span> | `GLOBAL` | 对所有会话有效，服务器重启后恢复成配置文件里的值 |
| <span style="color:#e03131">会话变量</span> | `SESSION` | 只对当前连接有效，不写 `GLOBAL` 时默认就是会话变量 |

查看和设置的写法：

- 查看：`SHOW [SESSION | GLOBAL] VARIABLES [LIKE '...']`，或者 `SELECT @@[session. | global.]变量名`
- 设置：`SET [SESSION | GLOBAL] 变量名 = 值`，或者 `SET @@[session. | global.]变量名 = 值`

以自动提交 `autocommit` 为例：

```sql
SHOW SESSION VARIABLES LIKE 'auto%';
SELECT @@autocommit, @@session.autocommit, @@global.autocommit;
SET SESSION autocommit = 0;
SELECT @@session.autocommit AS 当前会话, @@global.autocommit AS 全局;
SET SESSION autocommit = 1;
SELECT @@global.max_connections;
```

执行结果：

```text
+--------------------------+-------+
| Variable_name            | Value |
+--------------------------+-------+
| auto_generate_certs      | ON    |
| auto_increment_increment | 1     |
| auto_increment_offset    | 1     |
| autocommit               | ON    |
| automatic_sp_privileges  | ON    |
+--------------------------+-------+
+--------------+----------------------+---------------------+
| @@autocommit | @@session.autocommit | @@global.autocommit |
+--------------+----------------------+---------------------+
|            1 |                    1 |                   1 |
+--------------+----------------------+---------------------+
+--------------+--------+
| 当前会话     | 全局   |
+--------------+--------+
|            0 |      1 |
+--------------+--------+
+--------------------------+
| @@global.max_connections |
+--------------------------+
|                      151 |
+--------------------------+
```

注意第三个结果：用 `SET SESSION` 把当前会话的 `autocommit` 改成 0 之后，全局的值还是 1。<span style="color:#e03131">会话变量只改自己这个连接，不影响别人。</span>改完我又把它设回了 1，免得后面的操作不自动提交。

## 1.5 用户自定义变量

<span style="color:#e03131">用户自定义变量是用户自己定义的、以 `@` 开头的变量，不用提前声明，直接赋值就能用，作用范围是当前会话。</span>

赋值有两种方式：

- `SET @变量 = 值` 或 `SET @变量 := 值`，一次可以给多个变量赋值，用逗号隔开
- `SELECT 字段 INTO @变量 FROM 表`，把查询结果存进变量

```sql
SET @my_name = '张三';
SET @a := 10, @b := 20;
SELECT @my_name, @a + @b AS 和;

SELECT COUNT(*) INTO @cnt FROM student;
SELECT @cnt AS 学生人数;

SELECT MAX(score) INTO @max_math FROM score WHERE course = '数学';
SELECT @max_math AS 数学最高分;
SELECT name FROM student
WHERE id = (SELECT student_id FROM score WHERE course = '数学' AND score = @max_math);

SELECT @never_set;
```

执行结果：

```text
+----------+------+
| @my_name | 和   |
+----------+------+
| 张三     |   30 |
+----------+------+
+--------------+
| 学生人数     |
+--------------+
|            5 |
+--------------+
+-----------------+
| 数学最高分      |
+-----------------+
|              92 |
+-----------------+
+--------+
| name   |
+--------+
| 张三   |
+--------+
+------------+
| @never_set |
+------------+
| NULL       |
+------------+
```

第三个例子先把数学最高分存进 `@max_math`，下一条 SQL 再拿它去查是谁考的，查到是张三。变量就是这样把上一条 SQL 的结果带给下一条的。

最后一行：<span style="color:#e03131">使用一个从没赋过值的用户变量不会报错，得到的是 `NULL`。</span>变量名打错了也不会提醒，写的时候要小心。

## 1.6 局部变量

<span style="color:#e03131">局部变量用 `DECLARE` 声明，只能在 `BEGIN ... END` 块里面使用，块执行完就没了。</span>

声明语法：`DECLARE 变量名 类型 [DEFAULT 默认值];`。赋值和用户变量一样，用 `SET` 或 `SELECT ... INTO`。

写一个存储过程，算数学的平均分和人数：

```sql
DELIMITER $$
CREATE PROCEDURE p_avg_math()
BEGIN
  DECLARE avg_score DECIMAL(5,2) DEFAULT 0;
  DECLARE stu_count INT;
  SELECT AVG(score), COUNT(*) INTO avg_score, stu_count
  FROM score WHERE course = '数学';
  SELECT avg_score AS 数学平均分, stu_count AS 人数;
END$$
DELIMITER ;

CALL p_avg_math();
SELECT avg_score;
```

执行结果：

```text
+-----------------+--------+
| 数学平均分      | 人数   |
+-----------------+--------+
|           71.80 |      5 |
+-----------------+--------+
ERROR 1054 (42S22) at line 13: Unknown column 'avg_score' in 'field list'
```

五个人的数学是 92、78、56、88、45，加起来 359，除以 5 得 71.80，和结果一致。

存储过程外面再去 `SELECT avg_score`，报错找不到这一列，说明<span style="color:#e03131">局部变量出了 `BEGIN ... END` 就不存在了</span>。

三种变量放在一起比较：

| | 系统变量 | 用户自定义变量 | 局部变量 |
| --- | --- | --- | --- |
| 写法 | `@@变量名` | `@变量名` | 直接写变量名 |
| 谁定义 | MySQL 服务器 | 用户，直接赋值 | 用户，`DECLARE` 声明 |
| 作用范围 | 全局或当前会话 | 当前会话 | 所在的 `BEGIN ... END` 块 |

## 1.7 条件判断：IF

语法：

```sql
IF 条件1 THEN
  ...
ELSEIF 条件2 THEN
  ...
ELSE
  ...
END IF;
```

`ELSEIF` 和 `ELSE` 都可以省略，`ELSEIF` 可以写多个。<span style="color:#e03131">注意 `END IF` 后面要有分号。</span>

例子：查出王五的数学成绩，按 85 分以上优秀、60 分以上及格、其余不及格来分等级。

```sql
DELIMITER $$
CREATE PROCEDURE p_wangwu_math_level()
BEGIN
  DECLARE s INT;
  DECLARE level VARCHAR(10);
  SELECT score INTO s FROM score WHERE student_id = 3 AND course = '数学';
  IF s >= 85 THEN
    SET level = '优秀';
  ELSEIF s >= 60 THEN
    SET level = '及格';
  ELSE
    SET level = '不及格';
  END IF;
  SELECT '王五' AS 姓名, s AS 数学, level AS 等级;
END$$
DELIMITER ;

CALL p_wangwu_math_level();
```

执行结果：

```text
+--------+--------+-----------+
| 姓名   | 数学   | 等级      |
+--------+--------+-----------+
| 王五   |     56 | 不及格    |
+--------+--------+-----------+
```

王五数学 56 分，不满足 `s >= 85`，也不满足 `s >= 60`，落到 `ELSE`，等级是“不及格”。

这个过程有个问题：学生和分数线都写死在里面了，想查别人就得改代码。解决办法就是下一节的参数。

## 1.8 参数

### 1.8.1 三种参数

| 类型 | 含义 |
| --- | --- |
| <span style="color:#e03131">`IN`</span> | 输入参数，调用时传进来，默认就是 `IN` |
| <span style="color:#e03131">`OUT`</span> | 输出参数，过程把结果写进去，调用者拿回去用 |
| <span style="color:#e03131">`INOUT`</span> | 既传进来，又把改过的值带出去 |

语法：`CREATE PROCEDURE 过程名([IN | OUT | INOUT] 参数名 类型, ...)`。

### 1.8.2 例子

写三个过程：

- `p_get_score`：传入姓名和课程（`IN`），返回分数（`OUT`）。
- `p_level`：传入分数（`IN`），返回等级（`OUT`），就是上一节的 `IF` 改成参数版。
- `p_to_hundred`：传入一个 150 分制的分数，原地换算成百分制（`INOUT`）。

```sql
DELIMITER $$
CREATE PROCEDURE p_get_score(IN p_name VARCHAR(20), IN p_course VARCHAR(20), OUT p_score INT)
BEGIN
  SELECT s.score INTO p_score
  FROM score s JOIN student t ON s.student_id = t.id
  WHERE t.name = p_name AND s.course = p_course;
END$$

CREATE PROCEDURE p_level(IN p_score INT, OUT p_result VARCHAR(10))
BEGIN
  IF p_score >= 85 THEN
    SET p_result = '优秀';
  ELSEIF p_score >= 60 THEN
    SET p_result = '及格';
  ELSE
    SET p_result = '不及格';
  END IF;
END$$

CREATE PROCEDURE p_to_hundred(INOUT p_score DOUBLE)
BEGIN
  SET p_score = p_score / 150 * 100;
END$$
DELIMITER ;

CALL p_get_score('李四', '语文', @s);
CALL p_level(@s, @r);
SELECT @s AS 李四语文, @r AS 等级;

CALL p_level(45, @r);
SELECT @r AS 四十五分;

SET @full = 120;
CALL p_to_hundred(@full);
SELECT @full AS 换算成百分制;

CALL p_level(45, 'x');
```

执行结果：

```text
+--------------+--------+
| 李四语文     | 等级   |
+--------------+--------+
|           90 | 优秀   |
+--------------+--------+
+--------------+
| 四十五分     |
+--------------+
| 不及格       |
+--------------+
+--------------------+
| 换算成百分制       |
+--------------------+
|                 80 |
+--------------------+
ERROR 1414 (42000) at line 37: OUT or INOUT argument 2 for routine school.p_level is not a variable or NEW pseudo-variable in BEFORE trigger
```

逐个看一下：

1. `p_get_score('李四', '语文', @s)` 把李四的语文成绩 90 写进 `@s`；再把 `@s` 传给 `p_level`，得到“优秀”。<span style="color:#e03131">`OUT` 参数要用用户变量去接，调用完再 `SELECT` 出来。</span>
2. `p_level(45, @r)` 得到“不及格”，同一个过程，换个分数就能复用。
3. `@full` 原来是 120，传进 `p_to_hundred` 后变成 120 ÷ 150 × 100 = 80。同一个变量既是输入也是输出，这就是 `INOUT`。
4. 最后一句把字符串 `'x'` 传给 `OUT` 参数，直接报错。<span style="color:#e03131">`OUT` 和 `INOUT` 的位置必须传变量，不能传常量。</span>

## 1.9 条件判断：CASE

`CASE` 有两种写法。

**写法一：拿一个值去逐个比较**

```sql
CASE 表达式
  WHEN 值1 THEN ...
  WHEN 值2 THEN ...
  ELSE ...
END CASE;
```

**写法二：每个 WHEN 后面写一个条件**

```sql
CASE
  WHEN 条件1 THEN ...
  WHEN 条件2 THEN ...
  ELSE ...
END CASE;
```

例子：`p_course_type` 用写法一，按课程名判断文理科；`p_grade_letter` 用写法二，把分数换成 A、B、C、D 四档，它里面直接调用了上一节的 `p_get_score` 取分数。最后一条普通 `SELECT` 里也用了 `CASE`，一次给全班的数学分档。

```sql
DELIMITER $$
CREATE PROCEDURE p_course_type(IN p_course VARCHAR(20))
BEGIN
  DECLARE t VARCHAR(10);
  CASE p_course
    WHEN '数学' THEN SET t = '理科';
    WHEN '语文' THEN SET t = '文科';
    ELSE SET t = '其他';
  END CASE;
  SELECT p_course AS 课程, t AS 类别;
END$$

CREATE PROCEDURE p_grade_letter(IN p_name VARCHAR(20), IN p_course VARCHAR(20))
BEGIN
  DECLARE s INT;
  DECLARE g CHAR(1);
  CALL p_get_score(p_name, p_course, s);
  CASE
    WHEN s >= 90 THEN SET g = 'A';
    WHEN s >= 80 THEN SET g = 'B';
    WHEN s >= 60 THEN SET g = 'C';
    ELSE SET g = 'D';
  END CASE;
  SELECT p_name AS 姓名, p_course AS 课程, s AS 分数, g AS 等级;
END$$
DELIMITER ;

CALL p_course_type('数学');
CALL p_course_type('英语');
CALL p_grade_letter('赵六', '数学');
CALL p_grade_letter('孙七', '语文');

SELECT t.name AS 姓名, s.score AS 数学,
  CASE WHEN s.score >= 90 THEN 'A'
       WHEN s.score >= 80 THEN 'B'
       WHEN s.score >= 60 THEN 'C'
       ELSE 'D' END AS 等级
FROM score s JOIN student t ON s.student_id = t.id
WHERE s.course = '数学';
```

执行结果：

```text
+--------+--------+
| 课程   | 类别   |
+--------+--------+
| 数学   | 理科   |
+--------+--------+
+--------+--------+
| 课程   | 类别   |
+--------+--------+
| 英语   | 其他   |
+--------+--------+
+--------+--------+--------+--------+
| 姓名   | 课程   | 分数   | 等级   |
+--------+--------+--------+--------+
| 赵六   | 数学   |     88 | B      |
+--------+--------+--------+--------+
+--------+--------+--------+--------+
| 姓名   | 课程   | 分数   | 等级   |
+--------+--------+--------+--------+
| 孙七   | 语文   |     58 | D      |
+--------+--------+--------+--------+
+--------+--------+--------+
| 姓名   | 数学   | 等级   |
+--------+--------+--------+
| 张三   |     92 | A      |
| 李四   |     78 | C      |
| 王五   |     56 | D      |
| 赵六   |     88 | B      |
| 孙七   |     45 | D      |
+--------+--------+--------+
```

赵六数学 88，不到 90，满足 `s >= 80`，是 B；孙七语文 58，前三个条件都不满足，走 `ELSE`，是 D。<span style="color:#e03131">`WHEN` 是从上往下判断的，命中第一个就停</span>，所以条件要按分数从高到低写。

注意存储过程里的 `CASE` 语句和 `SELECT` 里的 `CASE` 表达式不太一样：前者以 `END CASE` 结束，后者以 `END` 结束。

还有一点：<span style="color:#e03131">存储过程里的 `CASE` 语句如果没写 `ELSE`，又一个 `WHEN` 都没命中，会直接报错。</span>

```sql
DELIMITER $$
CREATE PROCEDURE p_case_no_else(IN p_course VARCHAR(20))
BEGIN
  CASE p_course
    WHEN '数学' THEN SELECT '理科';
    WHEN '语文' THEN SELECT '文科';
  END CASE;
END$$
DELIMITER ;
CALL p_case_no_else('英语');
DROP PROCEDURE p_case_no_else;
```

执行结果：

```text
ERROR 1339 (20000) at line 10: Case not found for CASE statement
```

所以写 `CASE` 语句时，最好都带上 `ELSE`。

## 1.10 循环

MySQL 的存储过程里有三种循环：`WHILE`、`REPEAT`、`LOOP`。

| 循环 | 什么时候判断 | 什么时候结束 |
| --- | --- | --- |
| <span style="color:#e03131">`WHILE`</span> | 先判断，再执行 | 条件为假时退出 |
| <span style="color:#e03131">`REPEAT`</span> | 先执行，再判断 | `UNTIL` 后的条件为真时退出 |
| <span style="color:#e03131">`LOOP`</span> | 本身不判断 | 必须自己用 `LEAVE` 跳出，否则是死循环 |

`LOOP` 要配合两个语句使用：

- `LEAVE 标签`：跳出循环，相当于 `break`。
- `ITERATE 标签`：跳过本次剩下的语句，直接进入下一次，相当于 `continue`。

用循环分别算 1 到 100 的和、1 到 10 的和、10 以内偶数的和，再用 `p_times` 比较 `WHILE` 和 `REPEAT` 各执行了几次：

```sql
DELIMITER $$
CREATE PROCEDURE p_sum_while(IN n INT)
BEGIN
  DECLARE total INT DEFAULT 0;
  WHILE n > 0 DO
    SET total = total + n;
    SET n = n - 1;
  END WHILE;
  SELECT total AS WHILE求和;
END$$

CREATE PROCEDURE p_sum_repeat(IN n INT)
BEGIN
  DECLARE total INT DEFAULT 0;
  REPEAT
    SET total = total + n;
    SET n = n - 1;
  UNTIL n <= 0
  END REPEAT;
  SELECT total AS REPEAT求和;
END$$

CREATE PROCEDURE p_sum_even(IN n INT)
BEGIN
  DECLARE total INT DEFAULT 0;
  sum_loop: LOOP
    IF n <= 0 THEN
      LEAVE sum_loop;
    END IF;
    IF n % 2 = 1 THEN
      SET n = n - 1;
      ITERATE sum_loop;
    END IF;
    SET total = total + n;
    SET n = n - 1;
  END LOOP sum_loop;
  SELECT total AS 偶数和;
END$$
CREATE PROCEDURE p_times(IN n INT)
BEGIN
  DECLARE w INT DEFAULT 0;
  DECLARE r INT DEFAULT 0;
  DECLARE k INT DEFAULT n;
  WHILE k > 0 DO
    SET w = w + 1;
    SET k = k - 1;
  END WHILE;
  SET k = n;
  REPEAT
    SET r = r + 1;
    SET k = k - 1;
  UNTIL k <= 0
  END REPEAT;
  SELECT n AS n, w AS WHILE执行次数, r AS REPEAT执行次数;
END$$
DELIMITER ;

CALL p_sum_while(100);
CALL p_sum_repeat(10);
CALL p_times(3);
CALL p_times(0);
CALL p_sum_even(10);
```

执行结果：

```text
+-------------+
| WHILE求和   |
+-------------+
|        5050 |
+-------------+
+--------------+
| REPEAT求和   |
+--------------+
|           55 |
+--------------+
+------+-------------------+--------------------+
| n    | WHILE执行次数     | REPEAT执行次数     |
+------+-------------------+--------------------+
|    3 |                 3 |                  3 |
+------+-------------------+--------------------+
+------+-------------------+--------------------+
| n    | WHILE执行次数     | REPEAT执行次数     |
+------+-------------------+--------------------+
|    0 |                 0 |                  1 |
+------+-------------------+--------------------+
+-----------+
| 偶数和    |
+-----------+
|        30 |
+-----------+
```

逐个验算：

- 1 + 2 + … + 100 = 5050，1 + 2 + … + 10 = 55，和结果一致。
- n 为 3 时，两种循环都执行 3 次。<span style="color:#e03131">n 为 0 时，`WHILE` 一次都没执行，`REPEAT` 却执行了 1 次</span>，因为它先执行再判断。这就是两者最大的区别。
- `p_sum_even(10)` 里，n 是奇数时 `ITERATE` 跳过累加，n 减到 0 时 `LEAVE` 退出，累加的是 10、8、6、4、2，和为 30。

## 1.11 游标

### 1.11.1 游标是什么

前面的 `SELECT ... INTO` 只能把一行结果存进变量。查出来有多行，想一行一行地处理，就要用游标。

<span style="color:#e03131">游标是用来存储查询结果集的，可以在存储过程里对结果集一行一行地循环处理。</span>

使用游标分四步：

| 步骤 | 语法 |
| --- | --- |
| 声明 | `DECLARE 游标名 CURSOR FOR 查询语句;` |
| 打开 | `OPEN 游标名;` |
| 取一行 | `FETCH 游标名 INTO 变量1, 变量2, ...;` |
| 关闭 | `CLOSE 游标名;` |

### 1.11.2 例子：把数学及格的学生存进新表

建一张 `math_pass` 表，用游标逐行读出每个人的数学成绩，及格的插进去：

```sql
CREATE TABLE math_pass (
  name  VARCHAR(20),
  score INT
);

DELIMITER $$
CREATE PROCEDURE p_math_pass_v1()
BEGIN
  DECLARE v_name  VARCHAR(20);
  DECLARE v_score INT;
  DECLARE cur CURSOR FOR
    SELECT t.name, s.score
    FROM score s JOIN student t ON s.student_id = t.id
    WHERE s.course = '数学';

  OPEN cur;
  WHILE TRUE DO
    FETCH cur INTO v_name, v_score;
    IF v_score >= 60 THEN
      INSERT INTO math_pass VALUES (v_name, v_score);
    END IF;
  END WHILE;
  CLOSE cur;
END$$
DELIMITER ;

CALL p_math_pass_v1();
SELECT * FROM math_pass;
```

执行结果：

```text
ERROR 1329 (02000) at line 27: No data - zero rows fetched, selected, or processed
+--------+-------+
| name   | score |
+--------+-------+
| 张三   |    92 |
| 李四   |    78 |
| 赵六   |    88 |
+--------+-------+
```

表里确实插进了张三、李四、赵六三个及格的人（王五 56、孙七 45 没进去），但过程最后报了一个错：`No data - zero rows fetched`。原因是循环条件写的是 `WHILE TRUE`，五行读完之后还在 `FETCH`，没有数据可取就报错了。<span style="color:#e03131">游标本身不知道什么时候读完，要靠下一节的条件处理程序来告诉循环该停了。</span>

### 1.11.3 声明的顺序

<span style="color:#e03131">变量要先声明，游标后声明。</span>顺序反过来会报错：

```sql
DELIMITER $$
CREATE PROCEDURE p_wrong_order()
BEGIN
  DECLARE cur CURSOR FOR SELECT name FROM student;
  DECLARE v_name VARCHAR(20);
END$$
DELIMITER ;
```

执行结果：

```text
ERROR 1337 (42000) at line 2: Variable or condition declaration after cursor or handler declaration
```

完整的顺序是：<span style="color:#e03131">普通变量 → 游标 → 条件处理程序</span>。

## 1.12 条件处理程序

### 1.12.1 语法

<span style="color:#e03131">条件处理程序（handler）定义了存储过程执行中遇到某种问题时该怎么办。</span>

```sql
DECLARE 处理动作 HANDLER FOR 条件 语句;
```

处理动作有两种：

| 动作 | 含义 |
| --- | --- |
| <span style="color:#e03131">`CONTINUE`</span> | 执行完处理语句后，继续执行当前程序 |
| <span style="color:#e03131">`EXIT`</span> | 执行完处理语句后，终止当前程序 |

条件可以写成：

| 写法 | 含义 |
| --- | --- |
| `SQLSTATE '状态码'` | 某个具体的状态码，比如 `'02000'`、`'23000'` |
| `NOT FOUND` | 所有以 `02` 开头的状态码，也就是“没有数据了” |
| `SQLWARNING` | 所有以 `01` 开头的状态码 |
| `SQLEXCEPTION` | 除了上面两类之外的所有错误 |

### 1.12.2 用 CONTINUE 处理游标读完

上一节的游标报的是 `ERROR 1329 (02000)`，括号里的 `02000` 就是状态码，正好属于 `NOT FOUND`。声明一个 `CONTINUE` 处理程序：遇到 `NOT FOUND` 就把 `done` 设为 1，然后继续往下走，循环里检查到 `done = 1` 就 `LEAVE`。

```sql
TRUNCATE TABLE math_pass;

DELIMITER $$
CREATE PROCEDURE p_math_pass()
BEGIN
  DECLARE v_name  VARCHAR(20);
  DECLARE v_score INT;
  DECLARE done INT DEFAULT 0;
  DECLARE cur CURSOR FOR
    SELECT t.name, s.score
    FROM score s JOIN student t ON s.student_id = t.id
    WHERE s.course = '数学';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_name, v_score;
    IF done = 1 THEN
      LEAVE read_loop;
    END IF;
    IF v_score >= 60 THEN
      INSERT INTO math_pass VALUES (v_name, v_score);
    END IF;
  END LOOP read_loop;
  CLOSE cur;
  SELECT '处理完成' AS 状态;
END$$
DELIMITER ;

CALL p_math_pass();
SELECT * FROM math_pass;
```

执行结果：

```text
+--------------+
| 状态         |
+--------------+
| 处理完成     |
+--------------+
+--------+-------+
| name   | score |
+--------+-------+
| 张三   |    92 |
| 李四   |    78 |
| 赵六   |    88 |
+--------+-------+
```

这次三个及格的人照样插进去了，过程顺利走到最后，输出了“处理完成”，没有报错。这就是<span style="color:#e03131">游标的标准写法：变量、游标、`NOT FOUND` 处理程序，再用 `LOOP` 读，读完就 `LEAVE`。</span>

### 1.12.3 用 EXIT 处理主键冲突

再看 `EXIT` 的例子。插入重复的主键会报 `23000` 错误，在过程里捕获它，给出一句友好的提示，然后结束过程：

```sql
DELIMITER $$
CREATE PROCEDURE p_add_student(IN p_id INT, IN p_name VARCHAR(20), IN p_gender CHAR(1), IN p_class VARCHAR(20))
BEGIN
  DECLARE EXIT HANDLER FOR SQLSTATE '23000'
    SELECT CONCAT('学号 ', p_id, ' 已存在，没有插入') AS 结果;

  INSERT INTO student VALUES (p_id, p_name, p_gender, p_class);
  SELECT CONCAT('已添加 ', p_name) AS 结果;
END$$
DELIMITER ;

CALL p_add_student(6, '周八', '女', '三班');
CALL p_add_student(1, '吴九', '男', '一班');
SELECT * FROM student;
INSERT INTO student VALUES (1, '吴九', '男', '一班');
```

执行结果：

```text
+------------------+
| 结果             |
+------------------+
| 已添加 周八      |
+------------------+
+-----------------------------------+
| 结果                              |
+-----------------------------------+
| 学号 1 已存在，没有插入           |
+-----------------------------------+
+----+--------+--------+------------+
| id | name   | gender | class_name |
+----+--------+--------+------------+
|  1 | 张三   | 男     | 一班       |
|  2 | 李四   | 女     | 一班       |
|  3 | 王五   | 男     | 二班       |
|  4 | 赵六   | 女     | 二班       |
|  5 | 孙七   | 男     | 三班       |
|  6 | 周八   | 女     | 三班       |
+----+--------+--------+------------+
ERROR 1062 (23000) at line 15: Duplicate entry '1' for key 'student.PRIMARY'
```

- 学号 6 不存在，周八插入成功，走到了最后一句“已添加”。
- 学号 1 已经是张三的，插入失败，处理程序捕获了 `23000`，输出“学号 1 已存在”。因为是 `EXIT`，后面的“已添加”没有执行。
- 同样的插入不经过存储过程直接执行，就是一个原样的 `ERROR 1062`。

## 1.13 存储函数

### 1.13.1 和存储过程的区别

<span style="color:#e03131">存储函数是有返回值的存储过程</span>，参数只能是 `IN` 类型，用 `RETURNS` 声明返回类型，用 `RETURN` 返回结果。它最大的好处是能直接写在 `SELECT` 里，像 `SUM()`、`CONCAT()` 一样用。

```sql
CREATE FUNCTION 函数名([参数列表])
RETURNS 类型 [特性]
BEGIN
  ...
  RETURN ...;
END
```

### 1.13.2 特性不能省

MySQL 8 默认开启了二进制日志，这时创建函数必须写明它的特性，否则会报错：

```sql
SELECT @@log_bin, @@log_bin_trust_function_creators;

DELIMITER $$
CREATE FUNCTION f_level(p_score INT)
RETURNS VARCHAR(10)
BEGIN
  RETURN IF(p_score >= 60, '及格', '不及格');
END$$
DELIMITER ;
```

执行结果：

```text
+-----------+-----------------------------------+
| @@log_bin | @@log_bin_trust_function_creators |
+-----------+-----------------------------------+
|         1 |                                 0 |
+-----------+-----------------------------------+
ERROR 1418 (HY000) at line 4: This function has none of DETERMINISTIC, NO SQL, or READS SQL DATA in its declaration and binary logging is enabled (you *might* want to use the less safe log_bin_trust_function_creators variable)
```

`@@log_bin` 是 1，表示二进制日志开着，所以创建失败。常用的特性有三个：

| 特性 | 含义 |
| --- | --- |
| <span style="color:#e03131">`DETERMINISTIC`</span> | 相同的输入参数总是得到相同的结果 |
| <span style="color:#e03131">`NO SQL`</span> | 函数里不包含 SQL 语句 |
| <span style="color:#e03131">`READS SQL DATA`</span> | 函数里只读数据，不写数据 |

### 1.13.3 例子

- `f_level`：把分数换成等级。同样的分数永远是同样的等级，写 `DETERMINISTIC`。
- `f_total`：算一个学生的总分。它要查 `score` 表，写 `READS SQL DATA`。

```sql
DELIMITER $$
CREATE FUNCTION f_level(p_score INT)
RETURNS VARCHAR(10)
DETERMINISTIC
BEGIN
  DECLARE r VARCHAR(10);
  IF p_score >= 85 THEN
    SET r = '优秀';
  ELSEIF p_score >= 60 THEN
    SET r = '及格';
  ELSE
    SET r = '不及格';
  END IF;
  RETURN r;
END$$

CREATE FUNCTION f_total(p_student_id INT)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE t INT;
  SELECT IFNULL(SUM(score), 0) INTO t FROM score WHERE student_id = p_student_id;
  RETURN t;
END$$
DELIMITER ;

SELECT f_level(72) AS 七十二分;

SELECT t.name AS 姓名, s.course AS 课程, s.score AS 分数, f_level(s.score) AS 等级
FROM score s JOIN student t ON s.student_id = t.id
WHERE s.course = '语文';

SELECT name AS 姓名, f_total(id) AS 总分
FROM student
ORDER BY 总分 DESC;
```

执行结果：

```text
+--------------+
| 七十二分     |
+--------------+
| 及格         |
+--------------+
+--------+--------+--------+-----------+
| 姓名   | 课程   | 分数   | 等级      |
+--------+--------+--------+-----------+
| 张三   | 语文   |     85 | 优秀      |
| 李四   | 语文   |     90 | 优秀      |
| 王五   | 语文   |     72 | 及格      |
| 赵六   | 语文   |     64 | 及格      |
| 孙七   | 语文   |     58 | 不及格    |
+--------+--------+--------+-----------+
+--------+--------+
| 姓名   | 总分   |
+--------+--------+
| 张三   |    177 |
| 李四   |    168 |
| 赵六   |    152 |
| 王五   |    128 |
| 孙七   |    103 |
| 周八   |      0 |
+--------+--------+
```

函数直接用在了 `SELECT` 的字段列表里，一条 SQL 就给全班的语文分了等级，也直接按总分排了名。比如张三 92 + 85 = 177，李四 78 + 90 = 168。周八是上一节刚插入的，还没有成绩，`IFNULL` 让他的总分显示为 0 而不是 `NULL`。

这种“在查询里逐行调用”的用法，存储过程做不到，存储过程只能单独 `CALL`。

## 1.14 触发器

### 1.14.1 触发器是什么

<span style="color:#e03131">触发器是和表关联的数据库对象，在对表做 `INSERT`、`UPDATE`、`DELETE` 之前或之后，自动执行里面定义的 SQL。</span>它不用 `CALL`，也不能 `CALL`，表的数据一变它就自己跑。

常见用途：记录操作日志、校验或修正数据、维护数据的完整性。

### 1.14.2 OLD 和 NEW

触发器里可以用 `OLD` 和 `NEW` 引用被改动的那一行：

| 触发器类型 | `OLD` | `NEW` |
| --- | --- | --- |
| `INSERT` | 没有 | 将要插入或已经插入的新行 |
| `UPDATE` | 修改之前的行 | 修改之后的行 |
| `DELETE` | 被删除的行 | 没有 |

<span style="color:#e03131">MySQL 的触发器只支持行级触发</span>：`FOR EACH ROW`，一条语句影响了几行，触发器就执行几次。

## 1.15 触发器的语法和实现

### 1.15.1 语法

```sql
CREATE TRIGGER 触发器名
BEFORE | AFTER  INSERT | UPDATE | DELETE
ON 表名 FOR EACH ROW
BEGIN
  ...
END;
```

查看：`SHOW TRIGGERS`，或查 `information_schema.triggers`。删除：`DROP TRIGGER [IF EXISTS] 触发器名`。

### 1.15.2 例子：给成绩表记日志

建一张日志表 `score_log`，再给 `score` 表建四个触发器：

- `tr_score_insert`、`tr_score_update`、`tr_score_delete`：插入、修改、删除之后，各往日志表里记一条。
- `tr_score_check`：插入之前检查分数，超过 100 的改成 100，低于 0 的改成 0。

```sql
CREATE TABLE score_log (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  operation  VARCHAR(10) NOT NULL,
  score_id   INT         NOT NULL,
  detail     VARCHAR(100),
  op_time    DATETIME    NOT NULL
);

DELIMITER $$
CREATE TRIGGER tr_score_insert
AFTER INSERT ON score
FOR EACH ROW
BEGIN
  INSERT INTO score_log (operation, score_id, detail, op_time)
  VALUES ('insert', NEW.id,
          CONCAT('学生 ', NEW.student_id, ' 的', NEW.course, '成绩录入为 ', NEW.score), NOW());
END$$

CREATE TRIGGER tr_score_update
AFTER UPDATE ON score
FOR EACH ROW
BEGIN
  INSERT INTO score_log (operation, score_id, detail, op_time)
  VALUES ('update', NEW.id,
          CONCAT(NEW.course, '成绩从 ', OLD.score, ' 改为 ', NEW.score), NOW());
END$$

CREATE TRIGGER tr_score_delete
AFTER DELETE ON score
FOR EACH ROW
BEGIN
  INSERT INTO score_log (operation, score_id, detail, op_time)
  VALUES ('delete', OLD.id,
          CONCAT('删除了学生 ', OLD.student_id, ' 的', OLD.course, '成绩 ', OLD.score), NOW());
END$$

CREATE TRIGGER tr_score_check
BEFORE INSERT ON score
FOR EACH ROW
BEGIN
  IF NEW.score > 100 THEN
    SET NEW.score = 100;
  ELSEIF NEW.score < 0 THEN
    SET NEW.score = 0;
  END IF;
END$$
DELIMITER ;

SELECT trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'school'
ORDER BY trigger_name;
```

执行结果：

```text
+-----------------+---------------+--------------------+
| TRIGGER_NAME    | ACTION_TIMING | EVENT_MANIPULATION |
+-----------------+---------------+--------------------+
| tr_score_check  | BEFORE        | INSERT             |
| tr_score_delete | AFTER         | DELETE             |
| tr_score_insert | AFTER         | INSERT             |
| tr_score_update | AFTER         | UPDATE             |
+-----------------+---------------+--------------------+
```

四个触发器都建好了。现在对 `score` 表做一次插入、一次修改、一次删除：

```sql
INSERT INTO score (student_id, course, score) VALUES (6, '数学', 95), (6, '语文', 105);
UPDATE score SET score = 61 WHERE student_id = 3 AND course = '数学';
DELETE FROM score WHERE student_id = 5 AND course = '语文';

SELECT * FROM score WHERE student_id IN (3, 5, 6);
SELECT id, operation, score_id, detail FROM score_log;
```

执行结果：

```text
+----+------------+--------+-------+
| id | student_id | course | score |
+----+------------+--------+-------+
|  5 |          3 | 数学   |    61 |
|  6 |          3 | 语文   |    72 |
|  9 |          5 | 数学   |    45 |
| 11 |          6 | 数学   |    95 |
| 12 |          6 | 语文   |   100 |
+----+------------+--------+-------+
+----+-----------+----------+---------------------------------------+
| id | operation | score_id | detail                                |
+----+-----------+----------+---------------------------------------+
|  1 | insert    |       11 | 学生 6 的数学成绩录入为 95            |
|  2 | insert    |       12 | 学生 6 的语文成绩录入为 100           |
|  3 | update    |        5 | 数学成绩从 56 改为 61                 |
|  4 | delete    |       10 | 删除了学生 5 的语文成绩 58            |
+----+-----------+----------+---------------------------------------+
```

对照一下：

1. 给周八录入数学 95、语文 105。语文的 105 被 `BEFORE INSERT` 触发器改成了 100，所以表里存的是 100，日志里记的也是 100。<span style="color:#e03131">`BEFORE` 触发器可以修改 `NEW` 里的值，改完再真正写进表。</span>
2. 一条 `INSERT` 插了两行，日志里就有两条 `insert` 记录，说明触发器是逐行执行的。
3. 王五数学从 56 改成 61，`UPDATE` 触发器用 `OLD.score` 和 `NEW.score` 记下了改之前和改之后的值。
4. 删除孙七的语文，`DELETE` 触发器用 `OLD` 记下了被删掉的那一行，表里孙七只剩数学 45 了。

### 1.15.3 两个常见错误

<span style="color:#e03131">`AFTER` 触发器里不能修改 `NEW`，`INSERT` 触发器里没有 `OLD`。</span>写错了在创建时就会报错：

```sql
DELIMITER $$
CREATE TRIGGER tr_bad
AFTER INSERT ON score
FOR EACH ROW
BEGIN
  SET NEW.score = 100;
END$$
CREATE TRIGGER tr_bad2
BEFORE INSERT ON score
FOR EACH ROW
BEGIN
  SET @x = OLD.score;
END$$
DELIMITER ;
```

执行结果：

```text
ERROR 1362 (HY000) at line 2: Updating of NEW row is not allowed in after trigger
ERROR 1363 (HY000) at line 8: There is no OLD row in on INSERT trigger
```

`AFTER` 的时候数据已经写进表了，再改 `NEW` 没有意义；插入之前这一行根本不存在，自然也没有 `OLD`。

最后删掉一个触发器：

```sql
DROP TRIGGER IF EXISTS tr_score_check;
SELECT COUNT(*) AS 剩余触发器数 FROM information_schema.triggers WHERE trigger_schema = 'school';
```

执行结果：

```text
+--------------------+
| 剩余触发器数       |
+--------------------+
|                  3 |
+--------------------+
```

## 本章小结

存储过程、存储函数、触发器的对比：

| | 存储过程 | 存储函数 | 触发器 |
| --- | --- | --- | --- |
| 怎么执行 | `CALL` 调用 | 写在 SQL 里调用 | 表数据变化时自动执行 |
| 参数 | `IN`、`OUT`、`INOUT` | 只有 `IN` | 没有参数，用 `OLD`、`NEW` |
| 返回值 | 可以没有，用 `OUT` 带出结果 | 必须用 `RETURN` 返回一个值 | 没有 |
| 本文例子 | `p_get_score`、`p_math_pass` | `f_level`、`f_total` | `tr_score_insert` 等四个 |

```text
MySQL 存储过程
├── 基础
│   ├── 存储过程：存在数据库里的一组 SQL，封装复用、减少网络交互
│   ├── 语法：CREATE PROCEDURE / CALL / information_schema.routines / DROP PROCEDURE
│   └── 命令行里要用 DELIMITER $$ 临时修改结束符
├── 变量
│   ├── 系统变量：@@，分 GLOBAL 和 SESSION
│   ├── 用户自定义变量：@，直接赋值，当前会话有效，没赋值是 NULL
│   └── 局部变量：DECLARE 声明，只在 BEGIN ... END 里有效
├── 流程控制
│   ├── IF ... ELSEIF ... ELSE ... END IF
│   ├── CASE 两种写法，没有 ELSE 又没命中会报错
│   └── 循环：WHILE 先判断，REPEAT 先执行，LOOP 用 LEAVE、ITERATE 控制
├── 参数：IN 传入，OUT 传出，INOUT 传入又传出；OUT 位置必须传变量
├── 游标：DECLARE → OPEN → FETCH → CLOSE，声明顺序是变量、游标、处理程序
├── 条件处理程序
│   ├── 动作：CONTINUE 继续，EXIT 退出
│   └── 条件：SQLSTATE、NOT FOUND、SQLWARNING、SQLEXCEPTION
├── 存储函数：RETURNS + RETURN，只有 IN 参数，要写 DETERMINISTIC 等特性，能用在 SELECT 里
└── 触发器
    ├── BEFORE / AFTER × INSERT / UPDATE / DELETE，行级触发
    ├── OLD 是改之前的行，NEW 是改之后的行
    └── BEFORE 可以改 NEW，AFTER 不能改；INSERT 没有 OLD，DELETE 没有 NEW
```
