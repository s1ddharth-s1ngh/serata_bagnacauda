import type { Metadata, Viewport } from "next";
import { Courier_Prime, IM_Fell_DW_Pica } from "next/font/google";
import { EVENT } from "@/lib/event";
import { InkDefs } from "@/components/Carta";
import "./globals.css";

const fell = IM_Fell_DW_Pica({
  variable: "--font-fell",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const courier = Courier_Prime({
  variable: "--font-courier",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${EVENT.kicker} ${EVENT.name}`,
  description: EVENT.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f1e8d6",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${fell.variable} ${courier.variable} h-full antialiased`}>
      <body className="carta min-h-full font-serif text-ink">
        <InkDefs />
        {children}
      </body>
    </html>
  );
}
