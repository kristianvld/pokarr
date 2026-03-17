function isNumberInRange(value: string, min: number, max: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
}

export function isValidCronField(field: string, min: number, max: number) {
  const segments = field.split(',')
  if (segments.length === 0) {
    return false
  }

  return segments.every((segment) => {
    const trimmed = segment.trim()
    if (!trimmed) {
      return false
    }

    const [base, step] = trimmed.split('/')
    if (trimmed.split('/').length > 2) {
      return false
    }

    if (step !== undefined && !isNumberInRange(step, 1, max - min + 1)) {
      return false
    }

    if (base === '*') {
      return true
    }

    if (base.includes('-')) {
      const [start, end] = base.split('-')
      if (!start || !end) {
        return false
      }

      if (!isNumberInRange(start, min, max) || !isNumberInRange(end, min, max)) {
        return false
      }

      return Number(start) <= Number(end)
    }

    return isNumberInRange(base, min, max)
  })
}

export function isValidCronExpression(value: string) {
  const fields = value.trim().split(/\s+/)
  if (fields.length !== 5) {
    return false
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields
  return (
    isValidCronField(minute, 0, 59) &&
    isValidCronField(hour, 0, 23) &&
    isValidCronField(dayOfMonth, 1, 31) &&
    isValidCronField(month, 1, 12) &&
    isValidCronField(dayOfWeek, 0, 7)
  )
}

function cronFieldMatches(value: number, field: string, min: number) {
  const segments = field
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)

  return segments.some((segment) => {
    const [base, stepValue] = segment.split('/')
    let step: number | null = null
    if (stepValue) {
      const parsedStep = Number(stepValue)
      if (!Number.isInteger(parsedStep) || parsedStep <= 0) {
        return false
      }

      step = parsedStep
    }

    if (stepValue && step === null) {
      return false
    }

    if (base === '*') {
      return step == null ? true : (value - min) % step === 0
    }

    if (base.includes('-')) {
      const [startValue, endValue] = base.split('-')
      const start = Number(startValue)
      const end = Number(endValue)
      if (!Number.isInteger(start) || !Number.isInteger(end) || value < start || value > end) {
        return false
      }

      return step == null ? true : (value - start) % step === 0
    }

    const exact = Number(base)
    if (!Number.isInteger(exact) || value !== exact) {
      return false
    }

    return true
  })
}

function isWildcardField(field: string) {
  return field.trim() === '*'
}

export function cronMatches(date: Date, expression: string) {
  if (!isValidCronExpression(expression)) {
    return false
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = expression.trim().split(/\s+/)
  const weekday = date.getDay()
  const dayOfMonthMatches = cronFieldMatches(date.getDate(), dayOfMonth, 1)
  const dayOfWeekMatches =
    cronFieldMatches(weekday, dayOfWeek, 0) || (weekday === 0 && cronFieldMatches(7, dayOfWeek, 0))

  const dayMatches =
    isWildcardField(dayOfMonth) && isWildcardField(dayOfWeek)
      ? true
      : isWildcardField(dayOfMonth)
        ? dayOfWeekMatches
        : isWildcardField(dayOfWeek)
          ? dayOfMonthMatches
          : dayOfMonthMatches || dayOfWeekMatches

  return (
    cronFieldMatches(date.getMinutes(), minute, 0) &&
    cronFieldMatches(date.getHours(), hour, 0) &&
    cronFieldMatches(date.getMonth() + 1, month, 1) &&
    dayMatches
  )
}
