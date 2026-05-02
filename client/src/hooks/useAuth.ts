import { trpc } from "@/lib/trpc";

export function useAuth() {
  const { data: user, isLoading: loading, error } = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation();

  return {
    user: user || null,
    loading,
    error,
    isAuthenticated: !!user,
    logout: async () => {
      await logoutMutation.mutateAsync();
      window.location.reload();
    },
  };
}
