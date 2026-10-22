import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  info() {
    return {
      name: "diaspora-support API",
      status: "ok",
      environment: process.env.NODE_ENV ?? "development",
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async health() {
    const started = Date.now();
    try {
      await this.dataSource.query("SELECT 1");
      return { status: "ok", database: "up", responseMs: Date.now() - started };
    } catch {
      throw new ServiceUnavailableException({ status: "error", database: "down" });
    }
  }
}