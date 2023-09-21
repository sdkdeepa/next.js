import React from 'react'

import { DynamicServerError } from './hooks-server-context'
import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'

class StaticGenBailoutError extends Error {
  code = 'NEXT_STATIC_GEN_BAILOUT'
}

type BailoutOpts = { dynamic?: string; link?: string }

export type StaticGenerationBailout = (
  reason: string,
  opts?: BailoutOpts
) => boolean | never

function formatErrorMessage(reason: string, opts?: BailoutOpts) {
  const { dynamic, link } = opts || {}
  const suffix = link ? ` See more info here: ${link}` : ''
  return `Page${
    dynamic ? ` with \`dynamic = "${dynamic}"\`` : ''
  } couldn't be rendered statically because it used \`${reason}\`.${suffix}`
}

export const staticGenerationBailout: StaticGenerationBailout = (
  reason,
  opts
) => {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore?.forceStatic) {
    return true
  }

  if (staticGenerationStore?.dynamicShouldError) {
    throw new StaticGenBailoutError(
      formatErrorMessage(reason, { ...opts, dynamic: opts?.dynamic ?? 'error' })
    )
  }

  // If we're statically generating and we're using unstable_postpone, we should
  // call it now.
  // FIXME: (wyattjoh) review this such that resumption is possible
  if (
    staticGenerationStore?.isStaticGeneration &&
    staticGenerationStore?.useUnstablePostpone
  ) {
    ;(React as any).unstable_postpone(reason)
  }

  if (staticGenerationStore) {
    staticGenerationStore.revalidate = 0
  }

  if (staticGenerationStore?.isStaticGeneration) {
    const err = new DynamicServerError(
      formatErrorMessage(reason, {
        ...opts,
        // this error should be caught by Next to bail out of static generation
        // in case it's uncaught, this link provides some additional context as to why
        link: 'https://nextjs.org/docs/messages/dynamic-server-error',
      })
    )
    staticGenerationStore.dynamicUsageDescription = reason
    staticGenerationStore.dynamicUsageStack = err.stack

    throw err
  }

  return false
}
