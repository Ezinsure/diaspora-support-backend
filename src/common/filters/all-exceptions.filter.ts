import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { EntityNotFoundError, QueryFailedError } from "typeorm";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Something went wrong.";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body: any = exception.getResponse();
      message = typeof body === "string" ? body : body?.message ?? exception.message;
    } else if (exception instanceof QueryFailedError) {
      // Postgres error codes
      const code = (exception as any).driverError?.code;
      if (code === "23505") [status, message] = [409, "This data already exists"];
      else if (code === "23503") [status, message] = [409, "This record is linked to other data and can't be changed or removed"];
      else if (code === "23502") [status, message] = [400, "A required field is missing"];
      else if (code === "22P02") [status, message] = [400, "Invalid value in the request"];
    } else if (exception instanceof EntityNotFoundError) {
      [status, message] = [404, "Not found"];
    }

    // Only real server errors are logged with the stack trace
    if (status >= 500) {
      this.logger.error(`${req.method} ${req.originalUrl}`, exception?.stack ?? String(exception));
    }

    res.status(status).json({
      statusCode: status,
      message,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}