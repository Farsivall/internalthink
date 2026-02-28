/// <reference types="vite/client" />

declare namespace JSX {
  interface IntrinsicElements {
    'ion-icon': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & { name?: string; size?: string },
      HTMLElement
    >
  }
}
