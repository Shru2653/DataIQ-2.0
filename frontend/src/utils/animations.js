// Reusable Framer Motion variants
// Usage: import { fadeIn, slideUp, scaleIn, staggerContainer, item, modalBackdrop, modalContent } from '../utils/animations'

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 }
};

export const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.25 }
};

export const slideUp = {
  initial: { y: 16, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 16, opacity: 0 },
  transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
};

export const slideIn = (direction = 'right', distance = 24) => {
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y'
  const sign = direction === 'left' || direction === 'up' ? -1 : 1
  const from = sign * distance
  return {
    initial: { [axis]: from, opacity: 0 },
    animate: { [axis]: 0, opacity: 1 },
    exit: { [axis]: from, opacity: 0 },
    transition: { duration: 0.25 }
  }
}

export const scaleIn = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.2 }
};

export const staggerContainer = (stagger = 0.06, delayChildren = 0) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { staggerChildren: stagger, delayChildren }
});

export const item = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.2 }
};

export const modalBackdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 }
};

export const modalContent = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.98 },
  transition: { duration: 0.22 }
};
