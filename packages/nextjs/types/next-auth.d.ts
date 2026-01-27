import "next-auth";
import { DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  export interface Session {
    user: {
      userAddress?: string | null;
      isAdmin?: boolean | null;
    };
    expires: ISODateString;
  }

  export interface User extends DefaultUser {
    isAdmin?: boolean | null;
    userAddress?: string | null;
  }
}

declare module "next-auth/jwt" {
  export interface JWT extends DefaultJWT {
    isAdmin?: boolean | null;
    userAddress?: string | null;
  }
}
