import mongoose from "mongoose"

export function isValidObjectId(value: string) {
  return mongoose.isValidObjectId(value)
}
