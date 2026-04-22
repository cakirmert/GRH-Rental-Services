"use client"

import React, { useState } from "react"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { Role } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Loader2, Users as UsersIcon, MessageSquare, ArrowUpCircle, ArrowDownCircle, CheckCircle, XCircle } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function TeamPortal() {
  const { t } = useI18n()
  const utils = trpc.useUtils()

  // Queries
  const { data: staff = [], isLoading: isLoadingStaff } = trpc.team.listStaff.useQuery()
  const { data: proposals = [], isLoading: isLoadingProposals } = trpc.team.getActiveProposals.useQuery()
  const { data: messages = [], isLoading: isLoadingMessages } = trpc.team.getChatMessages.useQuery(undefined, {
    refetchInterval: 5000 // Poll every 5s for chat
  })

  // Current user info (needed to know if they already voted)
  const { data: session } = trpc.auth.getSession.useQuery()

  // Mutations
  const proposeRoleChange = trpc.team.proposeRoleChange.useMutation({
    onSuccess: (data: any) => {
      const description = data?.applied
        ? "Role updated."
        : "Proposal created. Waiting for votes."
      toast({ title: t("common.success"), description })
      utils.team.getActiveProposals.invalidate()
      utils.team.listStaff.invalidate()
      setIsProposeDialogOpen(false)
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" })
    }
  })

  const voteMutation = trpc.team.voteOnProposal.useMutation({
    onSuccess: () => {
      utils.team.getActiveProposals.invalidate()
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" })
    }
  })

  const sendChatMutation = trpc.team.sendChatMessage.useMutation({
    onSuccess: () => {
      utils.team.getChatMessages.invalidate()
      setChatInput("")
    }
  })

  // State
  const [isProposeDialogOpen, setIsProposeDialogOpen] = useState(false)
  const [selectedTargetUserId, setSelectedTargetUserId] = useState("")
  const [selectedProposedRole, setSelectedProposedRole] = useState<Role>(Role.USER)
  const [chatInput, setChatInput] = useState("")

  const handleProposeSubmit = () => {
    if (!selectedTargetUserId || !selectedProposedRole) return
    proposeRoleChange.mutate({
      targetUserId: selectedTargetUserId,
      proposedRole: selectedProposedRole
    })
  }

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    sendChatMutation.mutate({ body: chatInput })
  }

  const handleVote = (proposalId: string, vote: boolean) => {
    voteMutation.mutate({ proposalId, vote })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Staff Roster & Proposals */}
        <div className="lg:col-span-2 space-y-6">

          {/* Active Proposals Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Active Role Proposals</CardTitle>
              <CardDescription>Vote on pending role changes for team members.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingProposals ? (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>
              ) : proposals.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">No active proposals.</div>
              ) : (
                <div className="space-y-4">
                  {proposals.map((proposal: any) => {
                    const currentUserId = session?.user?.id
                    const myVote = proposal.votes.find((v: any) => v.voterId === currentUserId)
                    const yesVotes = proposal.votes.filter((v: any) => v.vote).length
                    const noVotes = proposal.votes.filter((v: any) => !v.vote).length

                    return (
                      <div key={proposal.id} className="border rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <div className="font-medium text-sm">
                            {proposal.creator.name || proposal.creator.email} proposed to make {proposal.targetUser.name || proposal.targetUser.email} an {proposal.proposedRole}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                            <span>Yes: {yesVotes}</span>
                            <span>No: {noVotes}</span>
                            <span>Expires: {new Date(proposal.expiresAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={myVote?.vote === true ? "default" : "outline"}
                            className="h-8"
                            onClick={() => handleVote(proposal.id, true)}
                            disabled={voteMutation.isPending}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" /> Yes
                          </Button>
                          <Button
                            size="sm"
                            variant={myVote?.vote === false ? "destructive" : "outline"}
                            className="h-8"
                            onClick={() => handleVote(proposal.id, false)}
                            disabled={voteMutation.isPending}
                          >
                            <XCircle className="mr-1 h-4 w-4" /> No
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Staff Roster Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div className="space-y-1">
                <CardTitle className="text-xl">Team Roster & Leaderboard</CardTitle>
                <CardDescription>View all staff and their handled bookings count.</CardDescription>
              </div>
              <Dialog open={isProposeDialogOpen} onOpenChange={setIsProposeDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                    Propose Role Change
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Propose Role Change</DialogTitle>
                    <DialogDescription>
                      Select a team member and the role you want to propose for them.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Team Member</Label>
                      <Select value={selectedTargetUserId} onValueChange={setSelectedTargetUserId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select member" />
                        </SelectTrigger>
                        <SelectContent>
                          {staff.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name || s.email} ({s.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Proposed Role</Label>
                      <Select value={selectedProposedRole} onValueChange={(val) => setSelectedProposedRole(val as Role)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                          <SelectItem value={Role.RENTAL}>Rental Team</SelectItem>
                          <SelectItem value={Role.USER}>User (Demote)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleProposeSubmit} disabled={proposeRoleChange.isPending || !selectedTargetUserId} size="sm">
                      {proposeRoleChange.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Submit Proposal
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {isLoadingStaff ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Bookings Handled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((member: any) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="font-medium">{member.name || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{member.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.role === Role.ADMIN ? "default" : "secondary"}>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {member.handledBookings}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Team Chat */}
        <div className="lg:col-span-1">
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> Team Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
              <ScrollArea className="flex-1 p-4">
                {isLoadingMessages ? (
                  <div className="flex justify-center py-6"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-6">No messages yet.</div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg: any) => (
                      <div key={msg.id} className={`flex flex-col ${msg.senderId === session?.user?.id ? 'items-end' : 'items-start'}`}>
                        <div className="text-xs text-muted-foreground mb-1">
                          {msg.sender.name || msg.sender.role} • {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                        <div className={`text-sm px-3 py-2 rounded-lg max-w-[85%] ${
                          msg.senderId === session?.user?.id
                            ? 'bg-primary text-primary-foreground rounded-br-none'
                            : 'bg-muted rounded-bl-none'
                        }`}>
                          {msg.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <div className="p-3 border-t bg-background/50">
                <form onSubmit={handleSendChat} className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="h-9"
                  />
                  <Button type="submit" size="sm" disabled={sendChatMutation.isPending || !chatInput.trim()}>
                    Send
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
