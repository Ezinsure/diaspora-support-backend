import type { DataSourceOptions } from "typeorm";

export const databaseOptions = (env: NodeJS.ProcessEnv = process.env): DataSourceOptions => {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing. Add it to your .env file.");

  return {
    type: "postgres",
    url,
    ssl: env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
    synchronize: false,
    migrationsTableName: "migrations",
    logging: env.DB_LOGGING === "true" ? ["query", "error"] : ["error"],
    extra: {
      max: Number(env.DB_POOL_MAX ?? 10),
    },
  };
};