import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { fontClassName } from "@/config/fonts";

export { metadata } from "@/config/metadata";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="cursor-default select-none">
      <body className={fontClassName}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
