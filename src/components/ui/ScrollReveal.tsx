import React, { useEffect, useRef, useState } from "react";

export interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "none";
}

export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  className = "",
  delay = 0,
  direction = "up",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Graceful fallback for non-browser or test environments
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          if (elementRef.current) {
            observer.unobserve(elementRef.current);
          }
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    const currentElem = elementRef.current;
    if (currentElem) {
      observer.observe(currentElem);
    }

    return () => {
      if (currentElem) {
        observer.unobserve(currentElem);
      }
      observer.disconnect();
    };
  }, []);

  const translateClass =
    direction === "up"
      ? isVisible
        ? "translate-y-0 opacity-100"
        : "translate-y-8 opacity-0"
      : isVisible
      ? "opacity-100"
      : "opacity-0";

  return (
    <div
      ref={elementRef}
      style={{
        transitionDelay: `${delay}ms`,
      }}
      className={`transition-all duration-700 ease-out transform motion-reduce:transform-none motion-reduce:transition-none ${translateClass} ${className}`}
    >
      {children}
    </div>
  );
};
