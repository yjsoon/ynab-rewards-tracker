declare module '@prisma/client' {
  export class PrismaClient {
    constructor(...args: any[])
    $connect(): Promise<void>
    $disconnect(): Promise<void>
    // Allow arbitrary model properties for typecheck convenience in the web app.
    [key: string]: any
  }
}
