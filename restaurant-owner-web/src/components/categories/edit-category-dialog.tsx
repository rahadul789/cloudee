import * as React from "react"

import {
  type Category,
  type CategoryStatus,
  createSlug,
  slugPattern,
} from "@/components/categories/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type Props = {
  category: Category | null
  open: boolean
  onOpenChange: (open: boolean) => void
  existingSlugs: string[]
  onSaveCategory: (data: {
    id: string
    name: string
    slug: string
    status: CategoryStatus
    description: string
  }) => void
}

export function EditCategoryDialog({
  category,
  open,
  onOpenChange,
  existingSlugs,
  onSaveCategory,
}: Props) {
  const [name, setName] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [status, setStatus] = React.useState<CategoryStatus>("Active")
  const [description, setDescription] = React.useState("")
  const [nameError, setNameError] = React.useState("")
  const [slugError, setSlugError] = React.useState("")
  const [isSlugTouched, setIsSlugTouched] = React.useState(false)

  React.useEffect(() => {
    if (open && category) {
      setName(category.name)
      setSlug(category.slug)
      setStatus(category.status)
      setDescription(category.description ?? "")
      setNameError("")
      setSlugError("")
      setIsSlugTouched(false)
    }

    if (!open) {
      setName("")
      setSlug("")
      setStatus("Active")
      setDescription("")
      setNameError("")
      setSlugError("")
      setIsSlugTouched(false)
    }
  }, [open, category])

  function validate(nextName: string, nextSlug: string) {
    let valid = true

    if (!nextName.trim()) {
      setNameError("Category name is required.")
      valid = false
    } else {
      setNameError("")
    }

    if (!nextSlug.trim()) {
      setSlugError("Slug is required.")
      valid = false
    } else if (!slugPattern.test(nextSlug)) {
      setSlugError("Use lowercase letters, numbers, and hyphens only.")
      valid = false
    } else if (existingSlugs.includes(nextSlug.trim())) {
      setSlugError("This slug already exists.")
      valid = false
    } else {
      setSlugError("")
    }

    return valid
  }

  function handleNameChange(value: string) {
    setName(value)
    setNameError("")

    if (!isSlugTouched) {
      const nextSlug = createSlug(value)
      setSlug(nextSlug)

      if (
        nextSlug &&
        slugPattern.test(nextSlug) &&
        !existingSlugs.includes(nextSlug)
      ) {
        setSlugError("")
      }
    }
  }

  function handleSlugChange(value: string) {
    const nextSlug = createSlug(value)
    setIsSlugTouched(true)
    setSlug(nextSlug)
    setSlugError("")
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!category) return

    const nextName = name.trim()
    const nextSlug = slug.trim()

    if (!validate(nextName, nextSlug)) return

    onSaveCategory({
      id: category.id,
      name: nextName,
      slug: nextSlug,
      status,
      description: description.trim(),
    })
    onOpenChange(false)
  }

  const isDisabled = !category || !name.trim() || !slug.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Category</DialogTitle>
          <DialogDescription>Update this menu category</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="edit-category-name" className="text-sm font-medium">
              Category Name
            </label>
            <Input
              id="edit-category-name"
              autoFocus
              placeholder="e.g. Burgers, Pizza, Drinks"
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              aria-invalid={!!nameError}
            />
            {nameError ? (
              <p className="text-sm text-destructive">{nameError}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-category-slug" className="text-sm font-medium">
              Slug
            </label>
            <Input
              id="edit-category-slug"
              placeholder="e.g. burgers"
              value={slug}
              onChange={(event) => handleSlugChange(event.target.value)}
              aria-invalid={!!slugError}
            />
            {slugError ? (
              <p className="text-sm text-destructive">{slugError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                URL preview: /menu/{slug || "category-slug"}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="edit-category-status"
              className="text-sm font-medium"
            >
              Status
            </label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as CategoryStatus)}
            >
              <SelectTrigger id="edit-category-status" className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="edit-category-description"
              className="text-sm font-medium"
            >
              Description
            </label>
            <Textarea
              id="edit-category-description"
              placeholder="Short internal note"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isDisabled}>
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
