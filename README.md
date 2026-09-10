# HealthNext

职业健康监测平台的从零重写脚手架，独立于 `health` monorepo。

- 后端：Spring Boot 3.5、Java 21、Sa-Token、Actuator
- 前端：Vue 3、Vite、TypeScript、Pinia、Element Plus
- 当前脚手架尚未接数据库、Redis 和 Netty
- 正式架构计划只使用 PostgreSQL + PostGIS，不设计双库或运行时旧库连接
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

## 产品设计

页面清单、Figma 工作方式、AI 效果图提示词和分阶段开发计划见 [PRODUCT_DESIGN_PLAN.md](./PRODUCT_DESIGN_PLAN.md)。

只包含页面清单、逐页 Figma Design 提示词、跨页交互规则和业务流程图的版本见 [FIGMA_PAGE_DESIGN_PLAN.md](./FIGMA_PAGE_DESIGN_PLAN.md)。
