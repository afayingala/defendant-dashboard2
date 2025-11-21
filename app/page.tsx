"use client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useState, useEffect } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table"
import { ArrowUpDown, Phone } from "lucide-react"
import Papa from "papaparse"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts"

export default function Home() {
  const [activeFilter, setActiveFilter] = useState("Captira")
  const [data, setData] = useState<any[]>([])
  const [columns, setColumns] = useState<ColumnDef<any>[]>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedDefendant, setSelectedDefendant] = useState<any>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dashboardData, setDashboardData] = useState<any>({
    balanceDistribution: [],
    paymentAging: [],
    locationDistribution: []
  })

  useEffect(() => {
    // Load data for both Captira and Simply filters
    if (activeFilter === "Captira" || activeFilter === "Simply") {
      loadCSVData()
    }
  }, [activeFilter])

  const loadCSVData = async () => {
    setLoading(true)
    try {
      const fileName = activeFilter === "Captira" ? "captira-dataa.csv" : "simply-data.csv";
      const response = await fetch(`/${fileName}`);
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            const headers = Object.keys(results.data[0])
            
            // Exclude columns based on active filter
            const excludedColumns = 
              activeFilter === "Captira" 
                ? ["Address", "City", "State", "Zip", "Mobile Ph #", "Date of Birth"]
                : ["Def. Phone"];
            
            const filteredHeaders = headers.filter(header => 
              !excludedColumns.includes(header)
            )
            
           // In your loadCSVData function, replace the columnDefs creation with this:

const columnDefs: ColumnDef<any>[] = filteredHeaders.map(header => ({
  id: header, // Explicit ID to avoid key parsing issues
  accessorFn: (row) => row[header], // Direct property access instead of accessorKey
  header: ({ column }) => (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className="hover:bg-gray-100 dark:hover:bg-gray-800 -ml-4"
    >
      {header}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  ),
  cell: ({ getValue }) => ( // Use getValue() from cell context
    <div className="py-2">{getValue() || '-'}</div>
  ),
}))
            setColumns(columnDefs)
            setData(results.data)
            calculateDashboardData(results.data)
          }
        },
        error: (error) => {
          console.error('CSV parsing error:', error)
        }
      })
    } catch (error) {
      console.error('Error loading CSV:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateDashboardData = (csvData: any[]) => {
    const balanceRanges = {
      '0–500': 0,
      '501–1,000': 0,
      '1,001–3,000': 0,
      '3,001–5,000': 0,
      '5,001+': 0
    }

    const agingBuckets = {
      '0–30 days': 0,
      '31–60 days': 0,
      '61–90 days': 0,
      '91+ days': 0
    }

    const locationCounts: { [key: string]: number } = {}
    const today = new Date()

    csvData.forEach((row) => {
      // Balance Distribution
      let balance = 0
      const balanceField = 
        activeFilter === "Captira"
          ? row['Balance Owed'] || row['Current Balance'] || row['Balance'] || '0'
          : row['Outstanding Balance'] || row['Total Due'] || '0';
      
      if (typeof balanceField === 'string') {
        balance = parseFloat(balanceField.replace(/[$,]/g, ''))
      } else {
        balance = parseFloat(balanceField) || 0
      }

      if (!isNaN(balance)) {
        if (balance <= 500) balanceRanges['0–500']++
        else if (balance <= 1000) balanceRanges['501–1,000']++
        else if (balance <= 3000) balanceRanges['1,001–3,000']++
        else if (balance <= 5000) balanceRanges['3,001–5,000']++
        else if (balance > 5000) balanceRanges['5,001+']++
      }

      // Payment Aging (only for Captira)
      if (activeFilter === "Captira" && row['Last Payment Date']) {
        try {
          const paymentDate = new Date(row['Last Payment Date'])
          if (!isNaN(paymentDate.getTime())) {
            const daysSince = Math.floor((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24))
            
            if (daysSince <= 30) agingBuckets['0–30 days']++
            else if (daysSince <= 60) agingBuckets['31–60 days']++
            else if (daysSince <= 90) agingBuckets['61–90 days']++
            else agingBuckets['91+ days']++
          }
        } catch (e) {
          // Invalid date
        }
      }

      // Location Distribution (only for Captira)
      if (activeFilter === "Captira" && row['City']) {
        const city = row['City'].trim()
        if (city) {
          locationCounts[city] = (locationCounts[city] || 0) + 1
        }
      }
    })

    const balanceData = Object.entries(balanceRanges).map(([range, count]) => ({
      range,
      count
    }))

    const agingData = activeFilter === "Captira"
      ? Object.entries(agingBuckets).map(([aging, count]) => ({ aging, count }))
      : []

    const locationData = activeFilter === "Captira"
      ? Object.entries(locationCounts)
          .map(([location, count]) => ({ location, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      : []

    setDashboardData({
      balanceDistribution: balanceData,
      paymentAging: agingData,
      locationDistribution: locationData
    })
  }

  const handleRowClick = (defendant: any) => {
    setSelectedDefendant(defendant)
    setDialogOpen(true)
  }

  const handleCall = () => {
    if (activeFilter === "Captira" && selectedDefendant?.['Mobile Ph #']) {
      window.location.href = `tel:${selectedDefendant['Mobile Ph #']}`
    } else if (activeFilter === "Simply" && selectedDefendant?.['Def. Phone']) {
      window.location.href = `tel:${selectedDefendant['Def. Phone']}`
    }
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  })

  const renderDefendantDialogContent = () => {
    if (!selectedDefendant) return null

    if (activeFilter === "Captira") {
      return (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</p>
              <p className="text-sm font-semibold mt-1">
                {selectedDefendant['Defendant'] || '-'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Date of Birth</p>
              <p className="text-sm font-semibold mt-1">
                {selectedDefendant['Date of Birth'] || '-'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Address</p>
            <p className="text-sm font-semibold mt-1">
              {selectedDefendant['Address'] || '-'}
            </p>
            <p className="text-sm font-semibold">
              {[
                selectedDefendant['City'],
                selectedDefendant['State'],
                selectedDefendant['Zip']
              ].filter(Boolean).join(', ') || '-'}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Mobile Phone</p>
            <p className="text-sm font-semibold mt-1">
              {selectedDefendant['Mobile Ph #'] || '-'}
            </p>
          </div>

          {selectedDefendant['Balance Owed'] && (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Balance Owed</p>
              <p className="text-lg font-bold mt-1">
                {selectedDefendant['Balance Owed']}
              </p>
            </div>
          )}
        </>
      )
    } else {
      // Simply dialog content
      return (
        <>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</p>
            <p className="text-sm font-semibold mt-1">
              {selectedDefendant['Name'] || selectedDefendant['Def.'] || '-'}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone Number</p>
            <p className="text-lg font-bold mt-1">
              {selectedDefendant['Def. Phone'] || selectedDefendant['Total Due'] || '-'}
            </p>
          </div>
        </>
      )
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-900">
      <main className="w-full flex flex-col gap-8 bg-white dark:bg-black p-6 sm:p-8">
        <div className="flex w-full items-center justify-between border-b pb-4">
          <header className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Payment Recovery
          </header>
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src="https://github.com/shadcn.png" alt="Admin" />
              <AvatarFallback>AD</AvatarFallback>
            </Avatar>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">Administrator</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Admin</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full gap-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-6">
            <Tabs defaultValue="Dashboard" className="w-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <TabsList className="grid w-full grid-cols-2 sm:w-auto">
                  <TabsTrigger value="Dashboard">Dashboard</TabsTrigger>
                  <TabsTrigger value="Data">Data</TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Button
                    variant={activeFilter === "Captira" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveFilter("Captira")}
                  >
                    Captira
                  </Button>
                  <Button
                    variant={activeFilter === "Simply" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveFilter("Simply")}
                  >
                    Simply
                  </Button>
                  <Button
                    variant={activeFilter === "Joint" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveFilter("Joint")}
                    disabled={true}
                  >
                    Joint
                  </Button>
                </div>
              </div>

              <TabsContent value="Dashboard">
                <div className="p-6 border rounded-lg mt-4">
                  <h2 className="text-2xl font-semibold mb-6">Dashboard Overview - {activeFilter}</h2>
                  
                  {activeFilter === "Captira" ? (
                    <div className="space-y-8">
                      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border">
                        <h3 className="text-xl font-semibold mb-4">Balance Distribution</h3>
                        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dashboardData.balanceDistribution}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="range" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" fill="#3b82f6" name="Number of Defendants" />
          </BarChart>
        </ResponsiveContainer>
                      </div>

                      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border">
                        <h3 className="text-xl font-semibold mb-4">Days Since Last Payment</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={dashboardData.paymentAging}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="aging" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="count" fill="#10b981" name="Number of Defendants">
                              {dashboardData.paymentAging.map((entry: any, index: number) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={index === 3 ? '#B97979' : index === 2 ? '#f59e0b' : index === 1 ? '#eab308' : '#10b981'} 
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border">
                        <h3 className="text-xl font-semibold mb-4">Defendants by Location (Top 10 Cities)</h3>
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart data={dashboardData.locationDistribution} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="location" type="category" width={120} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="count" fill="#8b5cf6" name="Number of Defendants">
                              {dashboardData.locationDistribution.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={`hsl(${174 - index * 10}, 70%, ${60 - index * 3}%)`} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border">
                        <h3 className="text-xl font-semibold mb-4">Balance Distribution</h3>
                        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dashboardData.balanceDistribution}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="range" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" fill="#3b82f6" name="Number of Defendants" />
          </BarChart>
        </ResponsiveContainer>
                      </div>

                     
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="Data">
                <div className="p-6 border rounded-lg mt-4">
                  <h2 className="text-2xl font-semibold mb-4">Data - {activeFilter}</h2>
                  
                  {loading ? (
                    <div className="text-center py-8">Loading data...</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <Input
                          placeholder="Search all columns..."
                          value={globalFilter ?? ""}
                          onChange={(e) => setGlobalFilter(e.target.value)}
                          className="max-w-sm"
                        />
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Total records: {data.length}
                        </p>
                      </div>

                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                              <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                  <TableHead key={header.id} className="whitespace-nowrap">
                                    {header.isPlaceholder
                                      ? null
                                      : flexRender(
                                          header.column.columnDef.header,
                                          header.getContext()
                                        )}
                                  </TableHead>
                                ))}
                              </TableRow>
                            ))}
                          </TableHeader>
                          <TableBody>
                            {table.getRowModel().rows?.length ? (
                              table.getRowModel().rows.map((row) => (
                                <TableRow
                                  key={row.id}
                                  data-state={row.getIsSelected() && "selected"}
                                  onClick={() => handleRowClick(row.original)}
                                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                  {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id} className="whitespace-nowrap">
                                      {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                      )}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell
                                  colSpan={columns.length}
                                  className="h-24 text-center"
                                >
                                  No data found. Make sure {activeFilter.toLowerCase()}-data.csv exists in the public folder.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Page {table.getState().pagination.pageIndex + 1} of{' '}
                          {table.getPageCount()}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Defendant Details Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                {activeFilter} Information
              </DialogTitle>
            </DialogHeader>
            
            {selectedDefendant && (
              <div className="space-y-4 py-4">
                {renderDefendantDialogContent()}
              </div>
            )}

<DialogFooter>
  <Button
    onClick={handleCall}
    disabled={
      activeFilter === "Captira" 
        ? !selectedDefendant?.['Mobile Ph #'] 
        : !selectedDefendant?.['Def. Phone']
    }
    style={{ color: '#FFFFFF', backgroundColor: '#323232' }}
    className="w-full text-black hover:opacity-90"
  >
    <Phone className="mr-2 h-4 w-4" />
    Call {activeFilter === "Captira" ? "Defendant" : "Account"}
  </Button>
</DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}