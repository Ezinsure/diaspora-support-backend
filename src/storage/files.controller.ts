import { Controller, Get, Param, Res } from "@nestjs/common";
import { StorageService } from "./storage.service.js";
import { Public } from "../auth/decorators/auth.decorators.js";

const INLINE = /\.(pdf|png|jpe?g|webp)$/i; 

// No script inside a served file can ever run 
const NO_SCRIPTS = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";

/**
 *  GET /v1/files/:token                 private document (signed link from the dashboard, valid 5 min)
 *  GET /v1/files/public/:folder/:file   public file (company logo on the website / in emails)
 */
@Public() 
@Controller("files")
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get("public/:folder/:file")
  async publicFile(@Param("folder") folder: string, @Param("file") file: string, @Res() res: any) {
    const path = await this.storage.resolvePublic(folder, file);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Security-Policy", NO_SCRIPTS);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); 
    return res.sendFile(path);
  }

  @Get(":token")
  async privateFile(@Param("token") token: string, @Res() res: any) {
    const { file, name } = await this.storage.resolvePrivate(token);
    const safeName = name.replace(/["\r\n]/g, "");
    res.setHeader("Cache-Control", "private, no-store");
    if (!/\.pdf$/i.test(safeName)) res.setHeader("Content-Security-Policy", NO_SCRIPTS);
    res.setHeader("Content-Disposition", `${INLINE.test(safeName) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); 
    return res.sendFile(file);
  }
}