"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deactivateUser,
  getUsers,
  inviteUser,
  updateUserRole,
  type UserRole,
  type UserSummary,
} from "@/lib/api";
import { readAuthUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Toast } from "@/components/ui/toast";

const PAGE_SIZE = 20;
const SELECT_CLASS =
  "h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]";
const USER_ROLE_OPTIONS: Array<{ label: string; value: UserRole }> = [
  { label: "Admin", value: "ADMIN" },
  { label: "Estimator", value: "ESTIMATOR" },
  { label: "Viewer", value: "VIEWER" },
];

function formatRoleLabel(role: UserSummary["role"]): string {
  if (role === "ADMIN") {
    return "Admin";
  }

  if (role === "ESTIMATOR") {
    return "Estimator";
  }

  return "Viewer";
}

export default function UsersPage() {
  const [userRole, setUserRole] = useState("VIEWER");
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("ESTIMATOR");
  const [inviteError, setInviteError] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const [userToEditRole, setUserToEditRole] = useState<UserSummary | null>(null);
  const [nextRole, setNextRole] = useState<UserRole>("ESTIMATOR");
  const [editRoleError, setEditRoleError] = useState("");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const [userToDeactivate, setUserToDeactivate] = useState<UserSummary | null>(null);
  const [deactivateError, setDeactivateError] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);

  useEffect(() => {
    setUserRole(readAuthUser()?.role ?? "VIEWER");
  }, []);

  const isAdmin = useMemo(() => userRole === "ADMIN", [userRole]);

  const loadUsers = useCallback(async (currentPage: number): Promise<void> => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const result = await getUsers({ page: currentPage, pageSize: PAGE_SIZE });
      setUsers(result.items);
      setTotalPages(result.pagination.totalPages);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setUsers([]);
      setTotalPages(0);
      setIsLoading(false);
      return;
    }

    void loadUsers(page);
  }, [isAdmin, loadUsers, page]);

  function getStatusState(
    user: UserSummary,
  ): { label: string; variant: "success" | "warning" | "danger"; detail: string | null } {
    const hasPendingInvite = user.pendingInvite === true;
    if (hasPendingInvite) {
      return {
        label: "Pending Invite",
        variant: "warning",
        detail: user.inviteExpiresAt ? `Expires ${formatDate(user.inviteExpiresAt)}` : null,
      };
    }

    if (user.status === "ACTIVE") {
      return {
        label: "Active",
        variant: "success",
        detail: null,
      };
    }

    return {
      label: "Inactive",
      variant: "danger",
      detail: null,
    };
  }

  function openEditRoleModal(user: UserSummary): void {
    setUserToEditRole(user);
    setNextRole(user.role);
    setEditRoleError("");
  }

  async function handleInviteUser(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setInviteError("");
    setIsInviting(true);

    try {
      const result = await inviteUser({
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      if (result.emailDelivery === "FAILED") {
        const linkMessage = result.setupLink ? ` Setup link: ${result.setupLink}` : "";
        setNotice({
          variant: "info",
          message: `Invite created for ${result.user.email}, but email delivery failed.${linkMessage}`,
        });
      } else {
        setNotice({
          variant: "success",
          message: `Invite sent to ${result.user.email}.`,
        });
      }
      setInviteEmail("");
      setInviteRole("ESTIMATOR");
      setIsInviteModalOpen(false);
      if (page === 1) {
        await loadUsers(1);
      } else {
        setPage(1);
      }
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Failed to send invite");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleUpdateRole(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!userToEditRole) {
      return;
    }

    setEditRoleError("");
    setIsUpdatingRole(true);
    try {
      await updateUserRole(userToEditRole.id, { role: nextRole });
      setNotice({
        variant: "success",
        message: `Updated role for ${userToEditRole.email}.`,
      });
      setUserToEditRole(null);
      await loadUsers(page);
    } catch (error) {
      setEditRoleError(error instanceof Error ? error.message : "Failed to update role");
    } finally {
      setIsUpdatingRole(false);
    }
  }

  async function handleDeactivateUser(): Promise<void> {
    if (!userToDeactivate) {
      return;
    }

    setDeactivateError("");
    setIsDeactivating(true);
    try {
      await deactivateUser(userToDeactivate.id);
      setNotice({
        variant: "success",
        message: `Deactivated ${userToDeactivate.email}.`,
      });
      setUserToDeactivate(null);
      await loadUsers(page);
    } catch (error) {
      setDeactivateError(error instanceof Error ? error.message : "Failed to deactivate user");
    } finally {
      setIsDeactivating(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            User Management
          </p>
          <h1 className="text-3xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Invite users, update roles, and deactivate accounts.
          </p>
        </div>
        {isAdmin ? <Button onClick={() => setIsInviteModalOpen(true)}>Invite User</Button> : null}
      </div>

      {!isAdmin ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only Admin users can access user management.
        </p>
      ) : null}

      {notice ? (
        <Toast
          variant={notice.variant}
          message={notice.message}
          onClose={() => {
            setNotice(null);
          }}
        />
      ) : null}

      {errorMessage ? (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-[var(--color-text-muted)]">
            <Spinner />
            <span>Loading users...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium">No users found.</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Invited and active users will appear here.
            </p>
          </div>
        ) : (
          <table role="table" className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-text-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Email</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Date Joined</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const status = getStatusState(user);

                return (
                  <tr key={user.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-3">{user.name}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{formatRoleLabel(user.role)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {status.detail ? (
                          <p className="text-xs text-[var(--color-text-muted)]">{status.detail}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => openEditRoleModal(user)}
                        >
                          Edit Role
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20"
                          onClick={() => {
                            setDeactivateError("");
                            setUserToDeactivate(user);
                          }}
                          disabled={user.status !== "ACTIVE"}
                        >
                          Deactivate
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" disabled={page <= 1 || !isAdmin} onClick={() => setPage((current) => current - 1)}>
          Previous
        </Button>
        <p className="text-sm text-[var(--color-text-muted)]">
          Page {page} {totalPages > 0 ? `of ${totalPages}` : ""}
        </p>
        <Button
          variant="secondary"
          disabled={totalPages === 0 || page >= totalPages || !isAdmin}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </Button>
      </div>

      <Modal
        isOpen={isInviteModalOpen}
        title="Invite User"
        onClose={() => {
          if (!isInviting) {
            setIsInviteModalOpen(false);
            setInviteError("");
          }
        }}
      >
        <form className="space-y-4" onSubmit={handleInviteUser}>
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="user@example.com"
              required
              disabled={isInviting}
            />
          </div>
          <div>
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              className={SELECT_CLASS}
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as UserRole)}
              disabled={isInviting}
            >
              {USER_ROLE_OPTIONS.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </select>
          </div>

          {inviteError ? <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{inviteError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsInviteModalOpen(false);
                setInviteError("");
              }}
              disabled={isInviting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isInviting}>
              {isInviting ? "Sending..." : "Send Invite"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={userToEditRole !== null}
        title="Edit User Role"
        onClose={() => {
          if (!isUpdatingRole) {
            setUserToEditRole(null);
            setEditRoleError("");
          }
        }}
      >
        <form className="space-y-4" onSubmit={handleUpdateRole}>
          <p className="text-sm text-[var(--color-text-muted)]">
            Updating role for <strong>{userToEditRole?.email}</strong>.
          </p>
          <div>
            <Label htmlFor="edit-role-select">Role</Label>
            <select
              id="edit-role-select"
              className={SELECT_CLASS}
              value={nextRole}
              onChange={(event) => setNextRole(event.target.value as UserRole)}
              disabled={isUpdatingRole}
            >
              {USER_ROLE_OPTIONS.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </select>
          </div>

          {editRoleError ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
              {editRoleError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setUserToEditRole(null);
                setEditRoleError("");
              }}
              disabled={isUpdatingRole}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isUpdatingRole}>
              {isUpdatingRole ? "Saving..." : "Save Role"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={userToDeactivate !== null}
        title="Deactivate User"
        onClose={() => {
          if (!isDeactivating) {
            setUserToDeactivate(null);
            setDeactivateError("");
          }
        }}
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          Deactivate <strong>{userToDeactivate?.email}</strong>? This user will lose access, but their history remains
          in audit records.
        </p>
        {deactivateError ? (
          <p role="alert" className="mt-4 text-sm text-rose-600 dark:text-rose-300">
            {deactivateError}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setUserToDeactivate(null);
              setDeactivateError("");
            }}
            disabled={isDeactivating}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeactivateUser} disabled={isDeactivating}>
            {isDeactivating ? "Deactivating..." : "Deactivate"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

