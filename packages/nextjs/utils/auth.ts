import { cookies } from "next/headers";
import { AuthOptions, Session, User, getServerSession } from "next-auth";
import { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { getCsrfToken } from "next-auth/react";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { type SiweMessage, parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { isAddressAdmin } from "~~/services/database/repositories/users";

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

export const providers = [
  CredentialsProvider({
    name: "Ethereum",
    credentials: {
      message: {
        label: "Message",
        type: "text",
        placeholder: "0x0",
      },
      signature: {
        label: "Signature",
        type: "text",
        placeholder: "0x0",
      },
    },
    async authorize(credentials) {
      try {
        if (!credentials?.message || !credentials?.signature) {
          return null;
        }

        const siweMessage = parseSiweMessage(credentials.message) as SiweMessage;

        const isMessageValid = validateSiweMessage({
          address: siweMessage?.address,
          message: siweMessage,
        });

        if (!isMessageValid) {
          return null;
        }

        const configuredDomain =
          process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
            ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
            : `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
        const nextAuthUrl = new URL(process.env.NEXTAUTH_URL as string) || new URL(configuredDomain);

        if (!nextAuthUrl || siweMessage.domain !== nextAuthUrl.host) {
          return null;
        }

        const cookieStore = await cookies();
        const csrfToken = await getCsrfToken({
          req: {
            headers: {
              cookie: cookieStore.toString(),
            },
          },
        });

        if (siweMessage.nonce !== csrfToken) {
          return null;
        }

        const isSignatureValid = await publicClient.verifyMessage({
          address: siweMessage.address,
          message: credentials.message,
          signature: credentials.signature as `0x${string}`,
        });

        if (!isSignatureValid) {
          return null;
        }

        const userIsAdmin = await isAddressAdmin(siweMessage.address);

        return {
          id: siweMessage.address,
          userAddress: siweMessage.address,
          isAdmin: userIsAdmin,
        };
      } catch (error) {
        console.error("Authorization error:", error);
        return null;
      }
    },
  }),
];

export const authOptions: AuthOptions = {
  providers,
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }: { token: JWT; user: User }) {
      if (user) {
        token.userAddress = user.userAddress;
        token.isAdmin = user.isAdmin;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      session.user.userAddress = token.userAddress;
      session.user.isAdmin = token.isAdmin;
      return session;
    },
  },
} as const;

export const isAdminSession = async () => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return false;
    }

    return session.user.isAdmin === true;
  } catch (error) {
    console.error("Error checking if user is admin:", error);
    return false;
  }
};
