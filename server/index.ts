import { app } from "./app";
const port = Number(process.env.PORT || 3001);
app.listen(
  port,
  process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
  () => console.log(`Open Mind School API: http://127.0.0.1:${port}`),
);
