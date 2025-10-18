import Image from "next/image";
import Link from "next/link";

type NavbarProps = {
  hidden?: boolean;
};

export function Navbar({ hidden }: NavbarProps) {
  if (hidden) return null;
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/50 dark:bg-black/20 border-b border-neutral-200/20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-14 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/favicon.png"
            alt="Hallaxius"
            width={24}
            height={24}
            className="rounded"
          />
          <span className="font-semibold tracking-tight text-lg md:text-xl">
            Hallaxius
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm md:text-sm"></nav>
      </div>
    </header>
  );
}

export default Navbar;
