export async function load(url, context, next) {
  if (url.endsWith('.json')) {
    return next(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
  }
  return next(url, context);
}
