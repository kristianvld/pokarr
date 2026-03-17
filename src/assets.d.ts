declare module '*.html' {
  const bundle: unknown
  export default bundle
}

declare module '*.svg' {
  const src: string
  export default src
}
