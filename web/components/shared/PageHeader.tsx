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
    <div className="px-3 md:px-6 py-3 md:py-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-1 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)] flex-shrink-0" />
        <h1 className="text-base md:text-xl font-bold tracking-tight text-white uppercase font-mono truncate">
          {title}
        </h1>
      </div>

      {center && (
        <div className="order-last w-full md:order-none md:w-auto md:flex-1 md:flex md:justify-center overflow-x-auto scrollbar-hide">
          {center}
        </div>
      )}

      <div className="flex items-center justify-end ml-auto">{children}</div>
    </div>
  );
};
