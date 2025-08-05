import type { Metadata } from "next"

import "../styles/globals.css"
// import "./styles.css"

import { Inter } from "next/font/google"

import { Toaster } from "../components/ui/sonner"
import { ThemeProvider } from "../components/theme-provider"
import React from "react"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Live Piano",
  description:
    "Live Piano is a live piano app built with Next.js and Liveblocks.",
  metadataBase: new URL("https://finance-auth0-app.vercel.app"),
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}

          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
