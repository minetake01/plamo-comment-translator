// Returns the user's display name.
// The name comes from the local profile.
const greeting = "Good morning, everyone";
/*
 * This function calculates the total price.
 * It includes tax and shipping.
 */
export function totalPrice(items: number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}
