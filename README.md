# HealthNext

人体展示默认使用「沉浸人体」：`/health-monitor/body-360-immersive`，实现为 `web/src/modules/human-body/Body360ImmersivePage.vue`。原「360° 人体」`/health-monitor/body-360` 保留为非默认页面，不再作为新开发和视觉验收基准；人员档案、事件详情和健康画像的人体入口应进入沉浸人体，并携带当前人员上下文。

职业健康监测平台的从零重写脚手架，独立于 `health` monorepo。

- 后端：Spring Boot 3.5、Java 21、Sa-Token、Actuator
- 前端：Vue 3、Vite、TypeScript、Pinia、Element Plus
- 当前脚手架尚未接数据库、Redis 和 Netty
- 正式架构计划只使用 Oracle Database，不设计双库或运行时旧库连接
- 本地账号：`admin / admin123`

远端：https://github.com/dashabijql-web/health-next

## 地址

| 服务 | 地址 |
| --- | --- |
| 前端 | http://localhost:9531/ |
| 后端 | http://localhost:8081/api |
| 健康检查 | http://localhost:8081/api/actuator/health |

## 启动

```bash
cd api && mvn test && mvn spring-boot:run
cd web && pnpm install && pnpm dev
```

未登录打开前端会进入 `/login`，登录后进入 `/home`。

前端 `/dev-api/*` 代理到 `http://localhost:8081/api/*`。Token 存在 Cookie `User-Token`，请求头使用 `satoken`。

## 开发计划（通俗版）

先读 [总体开发计划](./PRODUCT_DESIGN_PLAN.md)：系统做什么、先做哪一批、怎样算做完。

查具体页面时读 [页面设计计划](./FIGMA_PAGE_DESIGN_PLAN.md)：31 个页面分别怎么用、有哪些操作、需要检查什么。

了解页面背后的工作时读 [后台实施计划](./ENGINEERING_IMPLEMENTATION_PLAN.md)：用 Oracle 存数据，接手表、报警、记录处理结果，以及测试和上线。

标准列表页默认按“复用现有页面 → Grok Build 用 mock 数据实现 → 浏览器检查 → 接 Oracle 后台”实施；指挥中心、地图和三维人体等展示型页面再使用生图工具，Figma 可选。开工从总体计划第 12 节的 D0 开始；首批为 F18 待办事件、F14 人员档案和 C01 事件详情。

三份计划正文使用通俗说明；设计工具提示词和开发细节放在可展开的参考区。工具试用和实际开发尚需执行，计划要求和历史检查记录不代表当前已经完成。
