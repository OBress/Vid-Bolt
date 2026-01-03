"use client";

import React from "react";

interface PageHeaderProps {
  title: string;
  center?: React.ReactNode;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  center,
  children,
}) => {
  return (
    <div className="px-6 py-4 flex items-center justify-between relative">
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)]" />
        <h1 className="text-xl font-bold tracking-tight text-white uppercase font-mono whitespace-nowrap">
          {title}
        </h1>
      </div>

      <div className="absolute left-1/2 transform -translate-x-1/2">
        {center}
      </div>

      <div className="flex items-center justify-end">{children}</div>
    </div>
  );
};
