import "dotenv/config";
import { DataSource } from "typeorm";
import { databaseOptions } from "./database.config.js";

const AppDataSource = new DataSource({
  ...databaseOptions(),
  entities: ["dist/**/*.entity.js"],
  migrations: ["dist/migrations/*.js"],
});

export default AppDataSource;