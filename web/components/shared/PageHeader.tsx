"use client";

import React from "react";

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, children }) => {
  return (
    <div className="px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)]" />
        <h1 className="text-xl font-bold tracking-tight text-white uppercase font-mono">
          {title}
        </h1>
      </div>
      {children}
    </div>
  );
};
