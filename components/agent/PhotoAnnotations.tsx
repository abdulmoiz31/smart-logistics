'use client';

export interface AnnotationBox {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PhotoAnnotationsProps {
  boxes: AnnotationBox[];
}

export function PhotoAnnotations({ boxes }: PhotoAnnotationsProps) {
  if (!boxes.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map((box, index) => {
        const labelAbove = box.y >= 0.08;
        return (
          <div
            key={index}
            className="absolute border-2 border-c-accent"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
          >
            <span
              className={`absolute left-0 whitespace-nowrap rounded bg-c-accent px-1.5 py-0.5 text-[11px] font-bold text-c-accent-ink ${
                labelAbove ? '-top-6' : 'top-full mt-1'
              }`}
            >
              {box.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
