import { users } from "../config/schema";
import { eq } from "drizzle-orm";
import { db } from "~~/services/database/config/postgresClient";

export async function getUserByAddress(address: string) {
  const normalizedAddress = address.toLowerCase();
  return await db.query.users.findFirst({
    where: eq(users.address, normalizedAddress),
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

export async function setUserAdmin(address: string, isAdmin: boolean) {
  const normalizedAddress = address.toLowerCase();
  const [updatedUser] = await db.update(users).set({ isAdmin }).where(eq(users.address, normalizedAddress)).returning();
  return updatedUser;
}

export async function upsertUser(address: string, isAdmin: boolean = false) {
  const normalizedAddress = address.toLowerCase();
  const [user] = await db
    .insert(users)
    .values({ address: normalizedAddress, isAdmin })
    .onConflictDoUpdate({
      target: users.address,
      set: { isAdmin },
    })
    .returning();
  return user;
}
