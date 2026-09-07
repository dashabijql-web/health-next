# HealthNext

职业健康监测平台的从零重写脚手架，独立于 `health` monorepo。

- 后端：Spring Boot 3.5、Java 21、Sa-Token、Actuator
- 前端：Vue 3、Vite、TypeScript、Pinia、Element Plus
- 不接 SQL Server、Redis、Netty、双库
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
