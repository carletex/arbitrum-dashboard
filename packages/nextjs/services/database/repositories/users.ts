import { users } from "../config/schema";
import { eq, sql } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";

export async function getUserByAddress(address: string) {
  const normalizedAddress = address.toLowerCase();
  return await db.query.users.findFirst({
    where: eq(sql`lower(${users.address})`, normalizedAddress),
  });
}

export async function isAddressAdmin(address: string | null | undefined): Promise<boolean> {
  if (!address) return false;
  const user = await getUserByAddress(address);
  return user?.isAdmin === true;
}

export async function createUser(address: string, isAdmin: boolean = false) {
  const normalizedAddress = address.toLowerCase();
  const [newUser] = await db.insert(users).values({ address: normalizedAddress, isAdmin }).returning();
  return newUser;
}
