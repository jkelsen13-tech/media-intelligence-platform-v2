import { createAuthorizedWorkspaceReadHandler } from '../investigation-input-impact/handler.mjs'
import { validPosition } from '../investigation-input-impact/impact.mjs'
import { retainedSourceSpans } from './spans.mjs'

export function createSourceSpansHandler(options) {
  return createAuthorizedWorkspaceReadHandler({ ...options, inputKeys: ['left_position', 'right_position'],
    validateInput: input => validPosition(input.left_position) && validPosition(input.right_position) && input.left_position !== input.right_position,
    project: (bundle, input) => retainedSourceSpans(bundle, input.left_position, input.right_position) })
}
