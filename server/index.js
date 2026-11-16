import { createApp } from "./app.js";
import { connect } from "./db.js";
import { telemetry } from "./telemetry.js";

const db = await connect();
const server = createApp(db).listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log(`DevConnect disponível na porta ${process.env.PORT || 3000}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      await telemetry?.shutdown();
      process.exit(0);
    }),
  );
