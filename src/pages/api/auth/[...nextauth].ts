import NextAuth, { type NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

// Prisma adapter for NextAuth, optional and can be removed
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "../../../server/db/client";
import { env } from "../../../env/server.mjs";

export const nativeProviders = {
  github: "github-expo",
  discord: "discord-expo",
} as const;

export const isValidProvider = (
  k: string
): k is keyof typeof nativeProviders => {
  return k in nativeProviders;
};

// export const webProviders = Object.keys(nativeProviders);

const prismaAdapter = PrismaAdapter(prisma);

export const authOptions: NextAuthOptions = {
  // Configure one or more authentication providers
  adapter: prismaAdapter,
  providers: [
    GithubProvider({
      clientId: env.GITHUB_ID,
      clientSecret: env.GITHUB_SECRET,
    }),
    {
      ...GithubProvider({
        name: "GitHub Expo",
        clientId: env.EXPO_GITHUB_ID,
        clientSecret: env.EXPO_GITHUB_SECRET,
        checks: ["state", "pkce"],
        token: {
          async request(context) {
            const tokens = await context.client.oauthCallback(
              undefined,
              context.params,
              context.checks
            );
            return { tokens };
          },
        },
      }),
      id: nativeProviders.github,
    },
  ],
  callbacks: {
    session({ session, user }) {
      // Include user.id on session
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
    // async redirect({ url, baseUrl }) {
    //   // Allows relative callback URLs
    //   if (url.startsWith("/")) return `${baseUrl}${url}`;
    //   // Allows callback URLs on the same origin
    //   else if (new URL(url).origin === baseUrl) return url;
    //   else if (process.env.EXPO_PROXY_URL && url === process.env.EXPO_PROXY_URL)
    //     return url;
    //   return baseUrl;
    // },
    async signIn({ account }) {
      const userByAccount = await prismaAdapter.getUserByAccount({
        providerAccountId: account.providerAccountId,
        provider: account.provider,
      });
      // If registering
      if (!userByAccount) {
        const provider = account.provider;
        if (isValidProvider(provider)) {
          const counterpart = nativeProviders[provider];
          const userByAccount = await prismaAdapter.getUserByAccount({
            providerAccountId: account.providerAccountId,
            provider: counterpart,
          });
          // If exists the account in the counterpart provider
          if (userByAccount) {
            // Link the account to the user
            await prismaAdapter.linkAccount({
              ...account,
              userId: userByAccount.id,
            });
          }
        }
      }

      return true;
    },
  },
};

export default NextAuth(authOptions);
