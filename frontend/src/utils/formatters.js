export const formatNumber = (n) => new Intl.NumberFormat().format(n);
export const formatDate = (d) => new Intl.DateTimeFormat().format(new Date(d));
