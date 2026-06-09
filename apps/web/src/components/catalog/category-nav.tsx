"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AssemblyGroupDto } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";

interface CategoryNavProps {
  categories: AssemblyGroupDto[];
  activeCategoryId?: string;
  onSelectCategory: (categoryId: string) => void;
}

interface TreeNode {
  category: AssemblyGroupDto;
  children: TreeNode[];
}

export function buildTree(categories: AssemblyGroupDto[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const cat of categories) {
    nodeMap.set(cat.id, { category: cat, children: [] });
  }

  for (const cat of categories) {
    const node = nodeMap.get(cat.id)!;
    if (cat.parentId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(cat.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}

function CategoryItem({
  node,
  activeCategoryId,
  onSelectCategory,
  depth = 0,
}: {
  node: TreeNode;
  activeCategoryId?: string;
  onSelectCategory: (id: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isActive = node.category.id === activeCategoryId;

  return (
    <li>
      <button
        onClick={() => {
          onSelectCategory(node.category.id);
          if (hasChildren) setExpanded((prev) => !prev);
        }}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
          depth > 0 && "pl-6",
          isActive
            ? "border-l-2 border-accent text-ink font-semibold bg-accent-soft rounded-none"
            : "text-ink-2 hover:bg-bg-sunken",
        )}
        aria-current={isActive ? "page" : undefined}
      >
        <span>{node.category.name}</span>
        {hasChildren &&
          (expanded ? (
            <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" aria-hidden="true" />
          ))}
      </button>

      {hasChildren && expanded && (
        <ul className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <CategoryItem
              key={child.category.id}
              node={child}
              activeCategoryId={activeCategoryId}
              onSelectCategory={onSelectCategory}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CategoryNav({
  categories,
  activeCategoryId,
  onSelectCategory,
}: CategoryNavProps) {
  const tree = buildTree(categories);

  return (
    <nav aria-label="Категории части">
      <h2 className="font-display font-semibold text-xs uppercase tracking-wider text-muted px-3 mb-2">
        Категории
      </h2>
      <ul className="space-y-0.5">
        {tree.map((node) => (
          <CategoryItem
            key={node.category.id}
            node={node}
            activeCategoryId={activeCategoryId}
            onSelectCategory={onSelectCategory}
          />
        ))}
      </ul>
    </nav>
  );
}
