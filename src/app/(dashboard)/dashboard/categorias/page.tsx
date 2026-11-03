"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CategoryFormModal } from "@/components/categorias/CategoryFormModal";
import { DeleteCategoryModal } from "@/components/categorias/DeleteCategoryModal";

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  defaultType: string;
  monthlyGoal: number | null;
  isArchived: boolean;
  sortOrder: number;
  isSystemDefault?: boolean;
}

function SortableRow({
  category,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  category: Category;
  onEdit: (c: Category) => void;
  onArchive: (c: Category) => void;
  onRestore: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border/50 hover:bg-[hsl(var(--surface-hover))] ${
        category.isArchived ? "opacity-60" : ""
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <td className="py-3 px-4 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        ⋮⋮
      </td>
      <td className="py-3 px-4 font-medium text-foreground">{category.name}</td>
      <td className="py-3 px-4">
        <span
          className="inline-block w-6 h-6 rounded border border-border"
          style={{ backgroundColor: category.color }}
        />
      </td>
      <td className="py-3 px-4 text-muted-foreground capitalize">
        {category.defaultType.toLowerCase()}
      </td>
      <td className="py-3 px-4 text-right font-mono-nums text-foreground">
        {category.monthlyGoal != null
          ? new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(category.monthlyGoal)
          : "—"}
      </td>
      <td className="py-3 px-4">
        <span
          className={`text-xs px-2 py-1 rounded ${
            category.isArchived
              ? "bg-destructive/20 text-destructive"
              : "bg-success/20 text-success"
          }`}
        >
          {category.isArchived ? "Arquivada" : "Ativa"}
        </span>
      </td>
      <td className="py-3 px-4 flex gap-2">
        <button
          type="button"
          onClick={() => onEdit(category)}
          className="text-sm text-primary hover:underline"
        >
          Editar
        </button>
        {category.isArchived ? (
          <button
            type="button"
            onClick={() => onRestore(category)}
            className="text-sm text-success hover:underline"
          >
            Restaurar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onArchive(category)}
            className="text-sm text-destructive hover:underline"
          >
            Arquivar
          </button>
        )}
        {!category.isSystemDefault && (
          <button
            type="button"
            onClick={() => onDelete(category)}
            className="text-sm text-destructive/80 hover:text-destructive hover:underline"
          >
            Excluir
          </button>
        )}
      </td>
    </tr>
  );
}

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteMeta, setDeleteMeta] = useState<{
    transactionCount: number;
    vaultCount: number;
  } | null>(null);

  const loadCategories = useCallback(async () => {
    const res = await fetch("/api/categories?archived=true");
    if (res.ok) {
      const data = await res.json();
      setCategories(data);
    }
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await loadCategories();
      setLoading(false);
    }
    load();
  }, [loadCategories]);

  const handleArchive = async (cat: Category) => {
    const res = await fetch(`/api/categories/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: true }),
    });
    if (res.ok) await loadCategories();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Erro ao arquivar");
    }
  };

  const handleRestore = async (cat: Category) => {
    const res = await fetch(`/api/categories/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: false }),
    });
    if (res.ok) await loadCategories();
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    loadCategories();
  };

  const handleEditSuccess = () => {
    setEditingCategory(null);
    loadCategories();
  };

  const handleDelete = async (cat: Category) => {
    const res = await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      await loadCategories();
      return;
    }
    if (data.needsReassign) {
      setDeletingCategory(cat);
      setDeleteMeta({
        transactionCount: data.transactionCount ?? 0,
        vaultCount: data.vaultCount ?? 0,
      });
    } else {
      alert(data.error ?? "Erro ao excluir");
    }
  };

  const handleDeleteSuccess = () => {
    setDeletingCategory(null);
    setDeleteMeta(null);
    loadCategories();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    const res = await fetch("/api/categories/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: reordered.map((c) => c.id) }),
    });
    if (!res.ok) {
      await loadCategories();
      alert("Erro ao reordenar. Tente novamente.");
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Gestão de Categorias
        </h1>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          Nova Categoria
        </button>
      </div>
      <div className="card-surface overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 py-3 px-4" />
                <th className="text-left py-3 px-4 label-style">Nome</th>
                <th className="text-left py-3 px-4 label-style">Cor</th>
                <th className="text-left py-3 px-4 label-style">Tipo</th>
                <th className="text-right py-3 px-4 label-style">Meta Mensal</th>
                <th className="text-left py-3 px-4 label-style">Status</th>
                <th className="text-left py-3 px-4 label-style">Ações</th>
              </tr>
            </thead>
            <tbody>
              <SortableContext
                items={categories.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {categories.map((cat) => (
                  <SortableRow
                    key={cat.id}
                    category={cat}
                    onEdit={setEditingCategory}
                    onArchive={handleArchive}
                    onRestore={handleRestore}
                    onDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>
        </DndContext>
      </div>

      {showCreateModal && (
        <CategoryFormModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editingCategory && (
        <CategoryFormModal
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {deletingCategory && deleteMeta && (
        <DeleteCategoryModal
          category={deletingCategory}
          targetCategories={categories.filter((c) => c.id !== deletingCategory.id)}
          transactionCount={deleteMeta.transactionCount}
          vaultCount={deleteMeta.vaultCount}
          onClose={() => {
            setDeletingCategory(null);
            setDeleteMeta(null);
          }}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
