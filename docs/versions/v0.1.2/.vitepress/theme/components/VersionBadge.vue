<script setup lang="ts">
import { onMounted, ref } from 'vue'

declare const __DOCS_LATEST__: string
declare const __DOCS_IS_DEV__: boolean

const currentVersion = ref<string | null>(null)

function deriveVersion(path: string) {
  const versionMatch = path.match(/\/(v\d+\.\d+\.\d+)(?:\/|$)/)
  if (versionMatch) {
    return versionMatch[1]
  }

  if (path.endsWith('/edge') || path.endsWith('/edge/')) {
    return 'Bleeding'
  }

  if (__DOCS_IS_DEV__) {
    return 'Edge (dev)'
  }

  if (__DOCS_LATEST__) {
    return `${__DOCS_LATEST__} (latest)`
  }

  return null
}

onMounted(() => {
  currentVersion.value = deriveVersion(window.location.pathname)
})
</script>

<template>
  <span v-if="currentVersion" class="version-badge">{{ currentVersion }}</span>
</template>

<style scoped>
.version-badge {
  margin-left: 0.75rem;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, transparent);
  border-radius: 999px;
}
</style>

