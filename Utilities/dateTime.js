// Format date and time as "YYYY-MM-DD hh:mm:ss:mm"
function formatDateAndTime(dateTime) {
  const dateObject = new Date(dateTime);
  const year = dateObject.getFullYear();
  const month = String(dateObject.getMonth() + 1).padStart(2, "0");
  const day = String(dateObject.getDate()).padStart(2, "0");
  const hours = String(dateObject.getHours()).padStart(2, "0");
  const minutes = String(dateObject.getMinutes()).padStart(2, "0");
  const seconds = String(dateObject.getSeconds()).padStart(2, "0");
  const milliseconds = String(dateObject.getMilliseconds())
    .padStart(2, "0")
    .substring(0, 2);

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}:${milliseconds}`;
}

module.exports = {
  formatDateAndTime,
};
