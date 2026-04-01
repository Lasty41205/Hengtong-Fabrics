import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleLoginAccountsRequest, handleStaffLoginRequest } from "./server/loginApi.js";

function localLoginApiPlugin() {
  return {
    name: "local-login-api",
    configureServer(server) {
      server.middlewares.use("/api/login-accounts", (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }

        void handleLoginAccountsRequest(request, response);
      });

      server.middlewares.use("/api/staff-login", (request, response, next) => {
        if (request.method !== "POST") {
          next();
          return;
        }

        void handleStaffLoginRequest(request, response);
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
    env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    plugins: [react(), localLoginApiPlugin()]
  };
});
