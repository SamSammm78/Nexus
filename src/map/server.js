import express from "express";

let serverStarted =
  false;

export function startMapServer() {

  if (serverStarted) {
    return;
  }

  serverStarted =
    true;

  const app =
    express();

  const PORT =
    8765;

  app.use(
    express.static(
      process.cwd()
    )
  );

  app.listen(
    PORT,
    () => {

      console.log(
        `NEXUS Map : http://localhost:${PORT}/map.html`
      );
    }
  );
}