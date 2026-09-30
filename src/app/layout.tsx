import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FavoritesProvider } from "@/components/Favorites";

export const metadata: Metadata = {
  title: "SKATESPOT — Find it. Skate it. Pin it.",
  description: "스케이터가 함께 만드는 스트리트 스팟 지도",
  appleWebApp: { capable: true, title: "SKATESPOT", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f2f7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">
        <ClerkProvider>
          <FavoritesProvider>{children}</FavoritesProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
