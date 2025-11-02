"use client";

import { Code, FileText, Settings, Shield } from "lucide-react";
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 mix-blend-difference border-b border-input bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <Link
              href="/terms"
              className="flex items-center space-x-2 text-neutral-200/60 hover:text-neutral-200 transition-colors duration-300"
            >
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">Terms</span>
            </Link>
            <Link
              href="/privacy"
              className="flex items-center space-x-2 text-neutral-200/60 hover:text-neutral-200 transition-colors duration-300"
            >
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium">Privacy</span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/api"
              className="flex items-center space-x-2 text-neutral-200/60 hover:text-neutral-200 transition-colors duration-300"
            >
              <Code className="h-4 w-4" />
              <span className="text-sm font-medium">API</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center space-x-2 text-neutral-200/60 hover:text-neutral-200 transition-colors duration-300"
            >
              <Settings className="h-4 w-4" />
              <span className="text-sm font-medium">Settings</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
