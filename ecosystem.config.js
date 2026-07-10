module.exports = {
  apps: [
    {
      name: "turbo-agent-api",
      script: "npx",
      args: "tsx src/server.ts",
      env: {
        NODE_ENV: "production",
      }
    },
    {
      name: "turbo-agent-ui",
      script: "npm",
      args: "run dev -- --host --port 5173",
      cwd: "./ui",
    }
  ]
};
