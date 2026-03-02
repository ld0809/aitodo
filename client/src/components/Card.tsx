import { useState, useRef, useEffect } from 'react';
import type { Card, Todo, Tag } from '../types';
import { TodoCard } from './TodoCard';
import './Card.css';

interface CardProps {
  card: Card;
  todos: Todo[];
  tags: Tag[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleTodo: (id: string, status: string) => void;
  onEditTodo: (todo: Todo) => void;
  onDeleteTodo: (id: string) => void;
  onUpdateLayout: (id: string, x: number, y: number, w: number, h: number) => void;
}

export function Card({ card, todos, tags, onEdit, onDelete, onToggleTodo, onEditTodo, onDeleteTodo, onUpdateLayout }: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [startLayout, setStartLayout] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!cardRef.current) return;
      
      if (isDragging) {
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        const newX = startLayout.x + dx;
        const newY = startLayout.y + dy;
        cardRef.current.style.left = `${newX}px`;
        cardRef.current.style.top = `${newY}px`;
      } else if (isResizing) {
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        const newW = Math.max(250, startLayout.w + dx);
        const newH = Math.max(150, startLayout.h + dy);
        cardRef.current.style.width = `${newW}px`;
        cardRef.current.style.height = `${newH}px`;
      }
    };

    const handleMouseUp = () => {
      if ((isDragging || isResizing) && cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        onUpdateLayout(card.id, Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height));
      }
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, startPos, startLayout, card.id, onUpdateLayout]);

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.card-actions') || 
        (e.target as HTMLElement).closest('.card-body') ||
        (e.target as HTMLElement).closest('.add-todo-btn')) return;
    
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setStartLayout({
      x: cardRef.current?.offsetLeft || 0,
      y: cardRef.current?.offsetTop || 0,
      w: cardRef.current?.offsetWidth || 300,
      h: cardRef.current?.offsetHeight || 200
    });
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setStartLayout({
      x: cardRef.current?.offsetLeft || 0,
      y: cardRef.current?.offsetTop || 0,
      w: cardRef.current?.offsetWidth || 300,
      h: cardRef.current?.offsetHeight || 200
    });
  };

  return (
    <div
      ref={cardRef}
      className="card-draggable"
      style={{
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        left: (card.x || 0) > 0 ? `${card.x}px` : undefined,
        top: (card.y || 0) > 0 ? `${card.y}px` : undefined,
        width: (card.w || 300) > 0 ? `${card.w}px` : undefined,
        height: (card.h || 200) > 0 ? `${card.h}px` : undefined,
      }}
      onMouseDown={handleDragStart}
    >
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {card.name}
            <span className="count">{todos.length}</span>
          </div>
          <div className="card-actions">
            <button onClick={onEdit}>✎</button>
            <button onClick={onDelete}>🗑</button>
          </div>
        </div>
        <div className="card-body">
          {todos.map((todo) => (
            <TodoCard
              key={todo.id}
              todo={todo}
              tags={tags}
              onToggle={() => onToggleTodo(todo.id, todo.status)}
              onEdit={() => onEditTodo(todo)}
              onDelete={() => onDeleteTodo(todo.id)}
            />
          ))}
        </div>
        <div className="resize-handle" onMouseDown={handleResizeStart} />
      </div>
    </div>
  );
}
