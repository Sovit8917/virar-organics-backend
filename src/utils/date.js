const IST_TIMEZONE = 'Asia/Kolkata';

const istDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Returns the calendar date (YYYY-MM-DD) in Asia/Kolkata (IST) for a given instant.
 */
const getIstDateString = (date = new Date()) => istDateFormatter.format(date);

/**
 * Returns the UTC Date bounds [start, end] corresponding to the full IST calendar day
 * (00:00:00.000+05:30 to 23:59:59.999+05:30) for the given instant.
 */
const getIstDayBounds = (date = new Date()) => {
  const istDate = getIstDateString(date);
  return {
    start: new Date(`${istDate}T00:00:00.000+05:30`),
    end: new Date(`${istDate}T23:59:59.999+05:30`),
  };
};

/**
 * Returns the UTC Date corresponding to the start of the IST calendar month
 * (YYYY-MM-01T00:00:00.000+05:30) for the given instant.
 */
const getIstMonthStart = (date = new Date()) => {
  const istMonth = getIstDateString(date).slice(0, 7);
  return new Date(`${istMonth}-01T00:00:00.000+05:30`);
};

module.exports = {
  IST_TIMEZONE,
  getIstDateString,
  getIstDayBounds,
  getIstMonthStart,
};
